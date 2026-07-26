import { createClient } from "@/lib/supabase/client";

function getNextDueDate(currentDueDate: string, recurrence: string): string {
  const d = new Date(currentDueDate);
  switch (recurrence) {
    case "daily": d.setDate(d.getDate() + 1); break;
    case "weekly": d.setDate(d.getDate() + 7); break;
    case "biweekly": d.setDate(d.getDate() + 14); break;
    case "monthly": d.setMonth(d.getMonth() + 1); break;
    case "yearly": d.setFullYear(d.getFullYear() + 1); break;
    default: return currentDueDate;
  }
  return d.toISOString().split("T")[0];
}

export async function checkRecurringTasks() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: completedRecurring } = await supabase
    .from("tasks")
    .select("*")
    .eq("status", "done")
    .not("recurrence", "is", null)
    .neq("recurrence", "");

  if (!completedRecurring || completedRecurring.length === 0) return;

  for (const task of completedRecurring) {
    if (!task.due_date || !task.recurrence) continue;

    if (task.recurrence_end && new Date(task.recurrence_end) < new Date()) continue;

    const nextDue = getNextDueDate(task.due_date, task.recurrence);

    if (task.recurrence_end && nextDue > task.recurrence_end) continue;

    const maxPos = 9999;

    const { error } = await supabase.from("tasks").insert({
      project_id: task.project_id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      assignee_id: task.assignee_id,
      due_date: nextDue,
      section_id: task.section_id,
      position: maxPos,
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
}
