import { createClient } from "@/lib/supabase/client";

function getNextDueDate(currentDueDate: string, recurrence: string, timezone: string = "America/Barbados"): string {
  const [y, m, d] = currentDueDate.split("-").map(Number);
  const refUtc = Date.UTC(y, m - 1, d);
  const refDate = new Date(refUtc);
  switch (recurrence) {
    case "daily": refDate.setUTCDate(refDate.getUTCDate() + 1); break;
    case "weekly": refDate.setUTCDate(refDate.getUTCDate() + 7); break;
    case "biweekly": refDate.setUTCDate(refDate.getUTCDate() + 14); break;
    case "monthly": {
      const newMonth = refDate.getUTCMonth() + 1;
      refDate.setUTCMonth(newMonth);
      if (refDate.getUTCMonth() !== ((newMonth % 12) + 12) % 12) {
        refDate.setUTCDate(0);
      }
      break;
    }
    case "yearly": refDate.setUTCFullYear(refDate.getUTCFullYear() + 1); break;
    default: return currentDueDate;
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(refDate);
}

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

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("timezone")
      .eq("user_id", user.id)
      .single();
    const timezone = profile?.timezone || "America/Barbados";

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

      const nextDue = getNextDueDate(task.due_date, task.recurrence, timezone);

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
  } finally {
    inFlight = false;
  }
}
