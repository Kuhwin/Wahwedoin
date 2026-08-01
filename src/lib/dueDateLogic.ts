export interface DueDateTaskInput {
  id: string;
  title: string;
  due_date: string | null;
  assignee_id: string | null;
  project_id: string | null;
}

export interface DueDateNotification {
  user_id: string;
  title: string;
  body: string;
  type: string;
  link: string;
}

export interface TodayProvider {
  today: string;
  tomorrow: string;
}

export function classifyDueDateTask(
  task: DueDateTaskInput,
  { today, tomorrow }: TodayProvider,
): Omit<DueDateNotification, "user_id"> | null {
  if (!task.due_date) return null;

  if (task.due_date < today) {
    return {
      title: `Task overdue: ${task.title}`,
      body: `was due ${task.due_date}. Please update or complete this task.`,
      type: "warning",
      link: task.project_id ? `/projects/${task.project_id}` : "/my-tasks",
    };
  }
  if (task.due_date === today) {
    return {
      title: `Task due today: ${task.title}`,
      body: "This task is due today. Make sure it gets done!",
      type: "warning",
      link: task.project_id ? `/projects/${task.project_id}` : "/my-tasks",
    };
  }
  if (task.due_date === tomorrow) {
    return {
      title: `Task due tomorrow: ${task.title}`,
      body: "This task is due tomorrow.",
      type: "info",
      link: task.project_id ? `/projects/${task.project_id}` : "/my-tasks",
    };
  }
  return null;
}

/**
 * Build due-date notifications for the given tasks, deduplicated against
 * notifications created in the last 24h. `todayProvider` supplies each task's
 * local calendar day so the client and server can resolve per-user timezones
 * differently.
 */
export function buildDueDateNotifications(
  tasks: DueDateTaskInput[],
  existingKeys: Set<string>,
  todayProvider: (task: DueDateTaskInput) => TodayProvider,
): DueDateNotification[] {
  const notifications: DueDateNotification[] = [];

  for (const task of tasks) {
    if (!task.assignee_id) continue;

    const classified = classifyDueDateTask(task, todayProvider(task));
    if (!classified) continue;

    const key = `${task.assignee_id}:${classified.title}`;
    if (existingKeys.has(key)) continue;

    notifications.push({ user_id: task.assignee_id, ...classified });
  }

  return notifications;
}
