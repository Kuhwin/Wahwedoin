export interface ReminderCandidate {
  id: string;
  title: string;
  project_id: string | null;
  reminder_at: string;
  assignees: string[];
}

export interface ReminderNotification {
  user_id: string;
  title: string;
  body: string;
  type: string;
  link: string;
}

export const REMINDER_STALE_MS = 24 * 60 * 60 * 1000;

/**
 * Build "Reminder: <title>" notifications for candidates whose reminder has
 * come due since the last cron run. Reminders older than `REMINDER_STALE_MS`
 * are skipped so a delayed cron can't spam stale reminders, and each
 * user/title pair fires only once via `existingKeys`.
 */
export function buildTaskReminderNotifications(
  tasks: ReminderCandidate[],
  nowMs: number,
  existingKeys: Set<string>,
): ReminderNotification[] {
  const out: ReminderNotification[] = [];

  for (const task of tasks) {
    const reminderMs = new Date(task.reminder_at).getTime();
    if (Number.isNaN(reminderMs)) continue;
    if (reminderMs > nowMs) continue;
    if (reminderMs < nowMs - REMINDER_STALE_MS) continue;

    const title = `Reminder: ${task.title}`;
    const link = task.project_id ? `/projects/${task.project_id}` : "/my-tasks";

    for (const userId of task.assignees) {
      const key = `${userId}:${title}`;
      if (existingKeys.has(key)) continue;
      out.push({
        user_id: userId,
        title,
        body: "This task needs your attention.",
        type: "warning",
        link,
      });
    }
  }

  return out;
}
