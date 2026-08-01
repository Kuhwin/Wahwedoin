import { getServiceClient } from "@/lib/security";
import { addRecurrenceInterval } from "@/lib/recurrence";

/**
 * Server-side recurring task generation, run by the cron so recurring tasks
 * are regenerated even when no one has the app open. Mirrors the client
 * checker in src/lib/recurringTaskChecker.ts but runs with the service role.
 */
export async function checkRecurringTasksServer() {
  const supabase = getServiceClient();

  const { data: completedRecurring } = await supabase
    .from("tasks")
    .select("id, project_id, title, description, priority, assignee_id, due_date, section_id, created_by, recurrence, recurrence_end")
    .eq("status", "done")
    .not("recurrence", "is", null)
    .neq("recurrence", "");

  if (!completedRecurring || completedRecurring.length === 0) return 0;

  let created = 0;
  const now = new Date();

  for (const task of completedRecurring) {
    if (!task.due_date || !task.recurrence) continue;

    if (task.recurrence_end && new Date(task.recurrence_end) < now) continue;

    const nextDue = addRecurrenceInterval(task.due_date, task.recurrence);
    if (!nextDue) continue;

    if (task.recurrence_end && nextDue > task.recurrence_end) continue;

    // Idempotency guard: if a previous run (this cron or the client checker)
    // already regenerated this task, just clear its recurrence.
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
      created++;
    }
  }

  return created;
}
