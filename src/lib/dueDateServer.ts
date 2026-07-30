import { getServiceClient } from "@/lib/security";

export async function checkDueDatesServer() {
  const supabase = getServiceClient();

  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

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

  const notifications: { user_id: string; title: string; body: string; type: string; link: string }[] = [];

  for (const task of tasks) {
    if (!task.due_date || !task.assignee_id) continue;

    let title: string;
    let body: string;
    let type: string;

    if (task.due_date < today) {
      title = `Task overdue: ${task.title}`;
      body = `was due ${task.due_date}. Please update or complete this task.`;
      type = "warning";
    } else if (task.due_date === today) {
      title = `Task due today: ${task.title}`;
      body = "This task is due today. Make sure it gets done!";
      type = "warning";
    } else if (task.due_date === tomorrow) {
      title = `Task due tomorrow: ${task.title}`;
      body = "This task is due tomorrow.";
      type = "info";
    } else {
      continue;
    }

    const key = `${task.assignee_id}:${title}`;
    if (!existingKeys.has(key)) {
      notifications.push({
        user_id: task.assignee_id,
        title,
        body,
        type,
        link: task.project_id ? `/projects/${task.project_id}` : "/my-tasks",
      });
    }
  }

  if (notifications.length === 0) return 0;

  await supabase.from("notifications").insert(notifications);
  return notifications.length;
}
