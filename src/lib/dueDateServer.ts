import { getServiceClient } from "@/lib/security";
import { addDaysToDate, dateInTimezone, DEFAULT_TIMEZONE } from "@/lib/utils";
import { buildDueDateNotifications, type DueDateTaskInput } from "@/lib/dueDateLogic";

export async function checkDueDatesServer() {
  const supabase = getServiceClient();

  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("user_id, timezone");
  const tzMap = new Map((profiles || []).map((p) => [p.user_id, p.timezone || DEFAULT_TIMEZONE]));

  // Cache "today"/"tomorrow" per timezone so we only compute once per zone
  const tzDates = new Map<string, { today: string; tomorrow: string }>();
  function getTzDates(tz: string) {
    let entry = tzDates.get(tz);
    if (!entry) {
      const today = dateInTimezone(tz);
      entry = { today, tomorrow: addDaysToDate(today, 1) };
      tzDates.set(tz, entry);
    }
    return entry;
  }

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, due_date, assignee_id, project_id")
    .not("assignee_id", "is", null)
    .not("status", "eq", "done")
    .not("due_date", "is", null);

  if (!tasks || tasks.length === 0) return 0;

  const { data: existingNotifs } = await supabase
    .from("notifications")
    .select("title, user_id")
    .gte("created_at", new Date(Date.now() - 86400000).toISOString());

  const existingKeys = new Set((existingNotifs || []).map((n) => `${n.user_id}:${n.title}`));

  const notifications = buildDueDateNotifications(
    tasks as DueDateTaskInput[],
    existingKeys,
    (task) => getTzDates(tzMap.get(task.assignee_id!) || DEFAULT_TIMEZONE),
  );

  if (notifications.length === 0) return 0;

  await supabase.from("notifications").insert(notifications);
  return notifications.length;
}
