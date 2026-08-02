import { dateInTimezone, DEFAULT_TIMEZONE } from "@/lib/utils";

export interface WorkloadRow {
  user_id: string;
  open: number;
  in_progress: number;
  overdue: number;
}

export interface WorkloadTaskInput {
  user_id: string;
  status: string;
  due_date: string | null;
}

/**
 * Classify a task for workload reporting. A task counts toward `overdue`
 * when it is not done, has a due date, and that due date falls before the
 * assignee's local calendar day.
 */
export function classifyWorkloadTask(
  task: WorkloadTaskInput,
  today: string,
): { open: boolean; in_progress: boolean; overdue: boolean } {
  const done = task.status === "done";
  if (done) return { open: false, in_progress: false, overdue: false };
  const overdue = !!task.due_date && task.due_date < today;
  return {
    open: true,
    in_progress: task.status === "in_progress",
    overdue,
  };
}

export function buildWorkloadRows(
  tasks: WorkloadTaskInput[],
  tzMap: Map<string, string>,
  now: Date = new Date(),
): WorkloadRow[] {
  const perUser = new Map<string, { open: number; in_progress: number; overdue: number }>();
  const addUser = (userId: string) => {
    if (!perUser.has(userId)) perUser.set(userId, { open: 0, in_progress: 0, overdue: 0 });
  };

  for (const task of tasks) {
    addUser(task.user_id);
    const row = perUser.get(task.user_id)!;
    const today = dateInTimezone(tzMap.get(task.user_id) || DEFAULT_TIMEZONE, now);
    const cls = classifyWorkloadTask(task, today);
    if (cls.open) row.open += 1;
    if (cls.in_progress) row.in_progress += 1;
    if (cls.overdue) row.overdue += 1;
  }

  return Array.from(perUser.entries()).map(([user_id, counts]) => ({ user_id, ...counts }));
}
