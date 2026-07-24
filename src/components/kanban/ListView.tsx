"use client";

import { cn } from "@/lib/utils";
import { PRIORITY_CONFIG, type Task } from "@/lib/types";
import { Trash2 } from "lucide-react";

interface ListViewProps {
  tasks: Task[];
  onUpdateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onTaskClick?: (task: Task) => void;
}

export default function ListView({ tasks, onUpdateTask, onDeleteTask, onTaskClick }: ListViewProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
              Task
            </th>
            <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
              Status
            </th>
            <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
              Priority
            </th>
            <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
              Due Date
            </th>
            <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {tasks.length === 0 ? (
            <tr>
              <td colSpan={5} className="text-center py-8 text-sm text-slate-500">
                No tasks yet. Add one to get started.
              </td>
            </tr>
          ) : (
            tasks.map((task) => (
              <tr
                key={task.id}
                className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => onTaskClick?.(task)}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateTask(task.id, {
                          status: task.status === "done" ? "todo" : "done",
                        });
                      }}
                      className={cn(
                        "h-4 w-4 rounded border-2 flex items-center justify-center shrink-0",
                        task.status === "done"
                          ? "bg-green-500 border-green-500"
                          : "border-slate-300"
                      )}
                    >
                      {task.status === "done" && (
                        <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                    <span className={cn(
                      "text-sm font-medium",
                      task.status === "done" ? "text-slate-400 line-through" : "text-slate-900"
                    )}>
                      {task.title}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={task.status}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onUpdateTask(task.id, { status: e.target.value as Task["status"] })}
                    className="text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={task.priority}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onUpdateTask(task.id, { priority: e.target.value as Task["priority"] })}
                    className="text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <input
                    type="date"
                    value={task.due_date || ""}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onUpdateTask(task.id, { due_date: e.target.value || null })}
                    className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteTask(task.id);
                    }}
                    className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
