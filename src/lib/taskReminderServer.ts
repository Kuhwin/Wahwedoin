import { getServiceClient } from "@/lib/security";
import {
  buildTaskReminderNotifications,
  REMINDER_STALE_MS,
  type ReminderCandidate,
} from "@/lib/taskReminder";

export async function checkTaskRemindersServer() {
  const supabase = getServiceClient();

  const now = Date.now();
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, project_id, reminder_at")
    .not("status", "eq", "done")
    .not("reminder_at", "is", null)
    .lte("reminder_at", new Date(now).toISOString())
    .gte("reminder_at", new Date(now - REMINDER_STALE_MS).toISOString());

  if (!tasks || tasks.length === 0) return 0;

  const taskIds = tasks.map((t) => t.id);
  const { data: assigneeRows } = await supabase
    .from("task_assignees")
    .select("task_id, user_id")
    .in("task_id", taskIds);

  const assigneeMap = new Map<string, string[]>();
  for (const row of assigneeRows || []) {
    const list = assigneeMap.get(row.task_id) || [];
    list.push(row.user_id);
    assigneeMap.set(row.task_id, list);
  }

  const { data: existingNotifs } = await supabase
    .from("notifications")
    .select("title, user_id")
    .gte("created_at", new Date(now - REMINDER_STALE_MS).toISOString());

  const existingKeys = new Set((existingNotifs || []).map((n) => `${n.user_id}:${n.title}`));

  const candidates: ReminderCandidate[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    project_id: t.project_id,
    reminder_at: t.reminder_at,
    assignees: assigneeMap.get(t.id) || [],
  }));

  const notifications = buildTaskReminderNotifications(candidates, now, existingKeys);
  if (notifications.length === 0) return 0;

  await supabase.from("notifications").insert(notifications);
  return notifications.length;
}
