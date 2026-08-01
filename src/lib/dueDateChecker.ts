import { createClient } from "@/lib/supabase/client";
import { checkRecurringTasks } from "@/lib/recurringTaskChecker";
import { addDaysToDate, dateInTimezone, DEFAULT_TIMEZONE } from "@/lib/utils";
import { buildDueDateNotifications, type DueDateTaskInput } from "@/lib/dueDateLogic";

let lastRunAt = 0;

export async function checkDueDateNotifications() {
  try {
    // Throttle: this can be called on every dashboard data refresh, which
    // caused a request storm of auth/notification_preferences/tasks queries.
    // At most once per 5 minutes per tab is plenty for due-date alerts.
    const now = Date.now();
    if (now - lastRunAt < 5 * 60_000) return;
    lastRunAt = now;

    void checkRecurringTasks();
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Check notification preferences (table may not exist yet)
    let taskDueSoonEnabled = true;
    const { data: prefs, error: prefsErr } = await supabase
      .from("notification_preferences")
      .select("task_due_soon")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!prefsErr && prefs) taskDueSoonEnabled = prefs.task_due_soon !== false;
    if (!taskDueSoonEnabled) return;

    // Compare against the user's own calendar day, not UTC
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("timezone")
      .eq("user_id", user.id)
      .maybeSingle();
    const tz = profile?.timezone || DEFAULT_TIMEZONE;
    const today = dateInTimezone(tz);
    const tomorrow = addDaysToDate(today, 1);

    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, title, due_date, assignee_id, project_id")
      .eq("assignee_id", user.id)
      .not("status", "eq", "done")
      .not("due_date", "is", null);

    if (!tasks || tasks.length === 0) return;

    const { data: existingNotifs } = await supabase
      .from("notifications")
      .select("title")
      .eq("user_id", user.id)
      .gte("created_at", new Date(Date.now() - 86400000).toISOString());

    const existingNotifsData = (existingNotifs || []) as Array<{ title: string }>;
    const existingKeys = new Set(
      existingNotifsData.map((n) => `${user.id}:${n.title}`),
    );

    const notifications = buildDueDateNotifications(
      tasks as DueDateTaskInput[],
      existingKeys,
      () => ({ today, tomorrow }),
    );

    if (notifications.length > 0) {
      await supabase.from("notifications").insert(notifications);
    }
  } catch {
    // Silently fail — notification check should never break the app
  }
}
