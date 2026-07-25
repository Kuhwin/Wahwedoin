import { createClient } from "@/lib/supabase/client";

export async function checkDueDateNotifications() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Check notification preferences
    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("task_due_soon")
      .eq("user_id", user.id)
      .single();

    // If preferences exist and task_due_soon is disabled, skip
    if (prefs && !prefs.task_due_soon) return;

    const today = new Date().toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

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

    const existingTitles = new Set((existingNotifs || []).map((n: { title: string }) => n.title));
    const notifications: { user_id: string; title: string; body: string; type: string; link: string }[] = [];

    for (const task of tasks) {
      const dueDate = task.due_date!;

      if (dueDate < today) {
        const title = `Task overdue: ${task.title}`;
        if (!existingTitles.has(title)) {
          notifications.push({
            user_id: user.id,
            title,
            body: `was due ${dueDate}. Please update or complete this task.`,
            type: "warning",
            link: task.project_id ? `/projects/${task.project_id}` : "/my-tasks",
          });
        }
      } else if (dueDate === today) {
        const title = `Task due today: ${task.title}`;
        if (!existingTitles.has(title)) {
          notifications.push({
            user_id: user.id,
            title,
            body: "This task is due today. Make sure it gets done!",
            type: "warning",
            link: task.project_id ? `/projects/${task.project_id}` : "/my-tasks",
          });
        }
      } else if (dueDate === tomorrow) {
        const title = `Task due tomorrow: ${task.title}`;
        if (!existingTitles.has(title)) {
          notifications.push({
            user_id: user.id,
            title,
            body: "This task is due tomorrow.",
            type: "info",
            link: task.project_id ? `/projects/${task.project_id}` : "/my-tasks",
          });
        }
      }
    }

    if (notifications.length > 0) {
      await supabase.from("notifications").insert(notifications);
    }
  } catch {
    // Silently fail — notification check should never break the app
  }
}
