"use client";

import { useMemo } from "react";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";

interface GanttViewProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  projectStart?: string | null;
  projectDue?: string | null;
  projectColor?: string;
}

const DAY_MS = 86400000;

function toDayIndex(dateStr: string, minMs: number): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const ms = Date.UTC(y, (m || 1) - 1, d || 1);
  return Math.round((ms - minMs) / DAY_MS);
}

function todayStr(nowMs: number): string {
  const t = new Date(nowMs);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

export default function GanttView({ tasks, onTaskClick, projectStart, projectDue, projectColor }: GanttViewProps) {
  // eslint-disable-next-line react-hooks/purity
  const nowMs = useMemo(() => Date.now(), []);
  const parentTasks = useMemo(() => tasks.filter((t) => !t.parent_id), [tasks]);
  const subtasks = useMemo(() => tasks.filter((t) => !!t.parent_id), [tasks]);
  const parentIds = useMemo(() => new Set(parentTasks.map((t) => t.id)), [parentTasks]);

  const { minMs, totalDays, pxPerDay, headers, todayIndex, rows } = useMemo(() => {
    const dates: string[] = [];
    if (projectStart) dates.push(projectStart);
    if (projectDue) dates.push(projectDue);
    for (const t of tasks) {
      const start = t.start_date || (t.created_at ? t.created_at.slice(0, 10) : null);
      if (start) dates.push(start);
      if (t.due_date) dates.push(t.due_date);
    }

    let minStr = todayStr(nowMs);
    let maxStr = minStr;
    for (const d of dates) {
      if (d < minStr) minStr = d;
      if (d > maxStr) maxStr = d;
    }
    // Always keep a horizon of at least ~2 weeks from today
    const minToday = todayStr(nowMs);
    const todayPlus21 = new Date(nowMs + 21 * DAY_MS);
    const todayPlus21Str = `${todayPlus21.getFullYear()}-${String(todayPlus21.getMonth() + 1).padStart(2, "0")}-${String(todayPlus21.getDate()).padStart(2, "0")}`;
    if (minStr > minToday) minStr = minToday;
    if (maxStr < todayPlus21Str) maxStr = todayPlus21Str;
    if (maxStr === minStr) maxStr = todayPlus21Str;

    const minMs = Date.UTC(Number(minStr.slice(0, 4)), Number(minStr.slice(5, 7)) - 1, Number(minStr.slice(8, 10)));
    const maxMs = Date.UTC(Number(maxStr.slice(0, 4)), Number(maxStr.slice(5, 7)) - 1, Number(maxStr.slice(8, 10)));
    let totalDays = Math.round((maxMs - minMs) / DAY_MS) + 1;
    if (totalDays < 21) totalDays = 21;

    const pxPerDay = totalDays <= 60 ? 24 : totalDays <= 180 ? 10 : 5;

    // Week-grouped header labels
    const headers: { label: string; startIndex: number; endIndex: number }[] = [];
    const startDate = new Date(minMs);
    const firstDay = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
    const offsetToSunday = firstDay.getUTCDay();
    let cursorMs = minMs - offsetToSunday * DAY_MS;
    while (true) {
      const weekStart = new Date(cursorMs);
      const startIndex = Math.max(0, Math.round((cursorMs - minMs) / DAY_MS));
      const endIndex = Math.min(totalDays - 1, startIndex + 6);
      const label = startIndex === 0 || weekStart.getUTCDate() <= 7 || (startIndex > 0 && weekStart.getUTCMonth() !== new Date(minMs).getUTCMonth())
        ? weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : weekStart.toLocaleDateString("en-US", { day: "numeric" });
      headers.push({ label, startIndex, endIndex });
      if (endIndex >= totalDays - 1) break;
      cursorMs += 7 * DAY_MS;
    }

    const todayIdx = toDayIndex(todayStr(nowMs), minMs);

    // Build rows: parent tasks (with subtasks indented after them), then milestones
    const rowTasks: Task[] = [];
    for (const pt of parentTasks) {
      rowTasks.push(pt);
      const kids = subtasks.filter((s) => s.parent_id === pt.id);
      rowTasks.push(...kids);
    }
    const orphanSubtasks = subtasks.filter((s) => !parentIds.has(s.parent_id!));
    rowTasks.push(...orphanSubtasks);

    const rows = rowTasks.map((t) => {
      const start = t.start_date || (t.created_at ? t.created_at.slice(0, 10) : null);
      const startIdx = start ? toDayIndex(start, minMs) : null;
      const dueIdx = t.due_date ? toDayIndex(t.due_date, minMs) : null;
      return { task: t, isSubtask: !!t.parent_id, startIdx, dueIdx };
    });

    return { minMs, totalDays, pxPerDay, headers, todayIndex: todayIdx, rows };
  }, [tasks, projectStart, projectDue, parentTasks, subtasks, parentIds, nowMs]);

  const totalWidth = totalDays * pxPerDay;
  const todayLeft = todayIndex * pxPerDay;

  function barColor(t: Task): string {
    if (t.is_milestone) return "#f59e0b";
    if (t.status === "done") return "#22c55e";
    if (t.status === "in_progress") return "#3b82f6";
    return "#94a3b8";
  }

  const projectStartIdx = projectStart ? toDayIndex(projectStart, minMs) : null;
  const projectDueIdx = projectDue ? toDayIndex(projectDue, minMs) : null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <div className="relative min-w-full" style={{ minWidth: 320 + totalWidth }}>
          {/* Header row */}
          <div className="flex border-b border-slate-200 dark:border-slate-700">
            <div className="w-72 flex-shrink-0 border-r border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Task
            </div>
            <div className="relative flex-1" style={{ width: totalWidth }}>
              {headers.map((h, i) => (
                <div
                  key={i}
                  className="absolute top-0 h-full text-[10px] text-slate-400 dark:text-slate-500 border-r border-slate-100 dark:border-slate-700/50 pl-1 py-2"
                  style={{ left: h.startIndex * pxPerDay, width: (h.endIndex - h.startIndex + 1) * pxPerDay }}
                >
                  {h.label}
                </div>
              ))}
            </div>
          </div>

          {/* Project key dates bar */}
          {(projectStartIdx !== null || projectDueIdx !== null) && (
            <div className="flex border-b border-slate-200 dark:border-slate-700">
              <div className="w-72 flex-shrink-0 border-r border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                Project
              </div>
              <div className="relative flex-1" style={{ width: totalWidth, height: 28 }}>
                {projectStartIdx !== null && projectDueIdx !== null && (
                  <div
                    className="absolute top-1/2 -translate-y-1/2 h-2 rounded-full opacity-80"
                    style={{
                      left: projectStartIdx * pxPerDay,
                      width: Math.max(projectDueIdx - projectStartIdx, 0.5) * pxPerDay,
                      backgroundColor: projectColor || "#6366f1",
                    }}
                  />
                )}
                {projectStartIdx !== null && (
                  <div className="absolute top-1/2 -translate-y-1/2" style={{ left: projectStartIdx * pxPerDay }}>
                    <div className="h-2.5 w-2.5 rounded-full border-2 border-white dark:border-slate-900" style={{ backgroundColor: projectColor || "#6366f1" }} />
                  </div>
                )}
                {projectDueIdx !== null && (
                  <div className="absolute top-1/2 -translate-y-1/2" style={{ left: projectDueIdx * pxPerDay }}>
                    <div className="h-2.5 w-2.5 rounded-full border-2 border-white dark:border-slate-900" style={{ backgroundColor: projectColor || "#6366f1" }} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Task rows */}
          <div className="relative">
            {rows.map(({ task, isSubtask, startIdx, dueIdx }) => (
              <button
                key={task.id}
                onClick={() => onTaskClick(task)}
                className="flex w-full text-left border-b border-slate-100 dark:border-slate-700/50 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group"
              >
                <div className="w-72 flex-shrink-0 border-r border-slate-200 dark:border-slate-700 px-3 py-1.5 flex items-center gap-2 min-w-0">
                  {task.is_milestone && <span className="text-amber-500 text-[10px] flex-shrink-0">◆</span>}
                  <span className={cn("truncate text-xs", isSubtask ? "pl-4 text-slate-400 dark:text-slate-500" : "font-medium text-slate-700 dark:text-slate-300 group-hover:text-accent")}>
                    {task.title}
                  </span>
                  {task.status === "done" && <span className="text-[9px] text-green-500 flex-shrink-0">✓</span>}
                </div>
                <div className="relative flex-1" style={{ width: totalWidth, height: 32 }}>
                  {startIdx !== null && dueIdx !== null && dueIdx > startIdx && (
                    <div
                      className="absolute top-1/2 -translate-y-1/2 h-3 rounded-md opacity-80 group-hover:opacity-100 transition-opacity"
                      style={{ left: startIdx * pxPerDay + 1, width: Math.max((dueIdx - startIdx) * pxPerDay - 2, 6), backgroundColor: barColor(task) }}
                    />
                  )}
                  {dueIdx !== null && (startIdx === null || dueIdx <= startIdx) && (
                    <div className="absolute top-1/2 -translate-y-1/2" style={{ left: dueIdx * pxPerDay + 1 }}>
                      {task.is_milestone ? (
                        <div
                          className="w-2.5 h-2.5 rotate-45 border-2 border-white dark:border-slate-900"
                          style={{ backgroundColor: barColor(task) }}
                        />
                      ) : (
                        <div className="w-2 h-3 rounded-sm" style={{ backgroundColor: barColor(task) }} />
                      )}
                    </div>
                  )}
                  {startIdx !== null && dueIdx === null && (
                    <div className="absolute top-1/2 -translate-y-1/2" style={{ left: startIdx * pxPerDay + 1 }}>
                      <div className="w-1.5 h-3 rounded-sm bg-slate-300 dark:bg-slate-600" />
                    </div>
                  )}
                  {!isSubtask && dueIdx !== null && !task.is_milestone && (
                    <span className="absolute -top-1 text-[9px] text-slate-400 dark:text-slate-500 whitespace-nowrap" style={{ left: Math.max(dueIdx * pxPerDay + 6, 4) }}>
                      {task.due_date}
                    </span>
                  )}
                </div>
              </button>
            ))}

            {rows.length === 0 && (
              <div className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">
                No tasks to show on the timeline yet. Add tasks with due dates to see them here.
              </div>
            )}

            {/* Today marker */}
            <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-red-400/70" style={{ left: 288 + todayLeft }} />
          </div>
        </div>
      </div>
    </div>
  );
}
