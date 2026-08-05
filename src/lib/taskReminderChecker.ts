import { createClient } from "@/lib/supabase/client";
import {
  buildTaskReminderNotifications,
  REMINDER_STALE_MS,
  type ReminderCandidate,
} from "@/lib/taskReminder";

let lastRunAt = 0;

/**
 * Client-side mirror of the cron's reminder check. When a task's
 * `reminder_at` comes due this fires a "Reminder: <title>" notification into
 * the bell in real time, without waiting for the (twice-weekly) server cron.
 * Throttled to once per 2 minutes per tab so frequent data refreshes can't
 * trigger a request storm; stale (>24h) reminders are skipped like the server.
 */
export async function checkTaskReminders() {
  try {
    const now = Date.now();
    if (now - lastRunAt < 2 * 60_000) return;
    lastRunAt = now;

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Tasks I'm an assignee of (task_assignees mirrors the reminder server,
    // not the legacy assignee_id column) that have reminders due since our
    // last check.
    const { data: assigneeRows } = await supabase
      .from("task_assignees")
      .select("task_id")
      .eq("user_id", user.id);

    const assigneeData = (assigneeRows || []) as Array<{ task_id: string }>;
    if (assigneeData.length === 0) return;
    const taskIds = assigneeData.map((r) => r.task_id);

    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, title, project_id, reminder_at")
      .in("id", taskIds)
      .not("status", "eq", "done")
      .not("reminder_at", "is", null)
      .lte("reminder_at", new Date(now).toISOString())
      .gte("reminder_at", new Date(now - REMINDER_STALE_MS).toISOString());

    const tasksData = (tasks || []) as Array<{
      id: string;
      title: string;
      project_id: string | null;
      reminder_at: string;
    }>;
    if (tasksData.length === 0) return;

    const { data: existingNotifs } = await supabase
      .from("notifications")
      .select("title")
      .eq("user_id", user.id)
      .gte("created_at", new Date(now - REMINDER_STALE_MS).toISOString());

    const existingNotifsData = (existingNotifs || []) as Array<{ title: string }>;
    const existingKeys = new Set(existingNotifsData.map((n) => `${user.id}:${n.title}`));

    const candidates: ReminderCandidate[] = tasksData.map((t) => ({
      id: t.id,
      title: t.title,
      project_id: t.project_id,
      reminder_at: t.reminder_at,
      assignees: [user.id],
    }));

    const notifications = buildTaskReminderNotifications(candidates, now, existingKeys);
    if (notifications.length > 0) {
      await supabase.from("notifications").insert(notifications);
    }
  } catch {
    // Silently fail — reminder check should never break the app
  }
}
