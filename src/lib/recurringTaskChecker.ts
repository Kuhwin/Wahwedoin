import { createClient } from "@/lib/supabase/client";
import { addRecurrenceInterval } from "@/lib/recurrence";

let inFlight = false;

export async function checkRecurringTasks() {
  // Guard against concurrent runs (e.g. React StrictMode double-effects,
  // dashboard effect firing on every data refresh) which would double-insert.
  if (inFlight) return;
  inFlight = true;

  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: completedRecurring } = await supabase
      .from("tasks")
      .select("id, project_id, title, description, priority, assignee_id, due_date, section_id, created_by, recurrence, recurrence_end")
      .eq("status", "done")
      .not("recurrence", "is", null)
      .neq("recurrence", "");

    if (!completedRecurring || completedRecurring.length === 0) return;

    const now = new Date();

    for (const task of completedRecurring) {
      if (!task.due_date || !task.recurrence) continue;

      if (task.recurrence_end && new Date(task.recurrence_end) < now) continue;

      const nextDue = addRecurrenceInterval(task.due_date, task.recurrence);
      if (!nextDue) continue;

      if (task.recurrence_end && nextDue > task.recurrence_end) continue;

      // Idempotency guard: if a previous run (this tab, another tab, or the
      // server cron) already regenerated this task, just clear its recurrence.
      const { data: existing } = await supabase
        .from("tasks")
        .select("id")
        .eq("recurring_parent_id", task.id)
        .maybeSingle();

      if (existing) {
        await supabase.from("tasks").update({
          recurrence: null,
          recurrence_end: null,
        }).eq("id", task.id);
        continue;
      }

      const { error } = await supabase.from("tasks").insert({
        project_id: task.project_id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        assignee_id: task.assignee_id,
        due_date: nextDue,
        section_id: task.section_id,
        position: 9999,
        created_by: task.created_by,
        recurrence: task.recurrence,
        recurrence_end: task.recurrence_end,
        recurring_parent_id: task.id,
        status: "todo",
      });

      if (!error) {
        await supabase.from("tasks").update({
          recurrence: null,
          recurrence_end: null,
        }).eq("id", task.id);
      }
    }
  } finally {
    inFlight = false;
  }
}
