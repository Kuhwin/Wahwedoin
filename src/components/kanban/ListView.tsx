"use client";

import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { Trash2 } from "lucide-react";
import { type Task } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ListViewProps {
  tasks: Task[];
  onUpdateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onTaskClick?: (task: Task) => void;
}

export default function ListView({ tasks, onUpdateTask, onDeleteTask, onTaskClick }: ListViewProps) {
  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const destIndex = result.destination.index;
    const sourceIndex = result.source.index;
    if (destIndex === sourceIndex) return;

    const ordered = [...tasks];
    const [moved] = ordered.splice(sourceIndex, 1);
    ordered.splice(destIndex, 0, moved);

    const updates: Promise<void>[] = [];
    ordered.forEach((t, i) => {
      if (t.position !== i) {
        updates.push(onUpdateTask(t.id, { position: i }));
      }
    });
    void Promise.all(updates);
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
            <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider px-4 py-3">
              Task
            </th>
            <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider px-4 py-3">
              Status
            </th>
            <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider px-4 py-3">
              Priority
            </th>
            <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider px-4 py-3">
              Due Date
            </th>
            <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider px-4 py-3">
              Actions
            </th>
          </tr>
        </thead>
      </table>
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="list-view">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps}>
              {tasks.length === 0 ? (
                <div className="text-center py-8 text-sm text-slate-500 dark:text-slate-400">
                  No tasks yet. Add one to get started.
                </div>
              ) : (
                tasks.map((task, index) => (
                  <Draggable key={task.id} draggableId={task.id} index={index}>
                    {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      className={cn(
                        "flex items-center border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-grab active:cursor-grabbing",
                        snapshot.isDragging && "bg-indigo-50 dark:bg-indigo-900/20 shadow-lg ring-1 ring-indigo-200 dark:ring-indigo-800"
                      )}
                    >
                      <div
                        className="flex-1 flex items-center gap-3 px-4 py-3 cursor-pointer min-w-0"
                        onClick={() => onTaskClick?.(task)}
                      >
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
                                : "border-slate-300 dark:border-slate-600"
                            )}
                          >
                            {task.status === "done" && (
                              <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                          <span className={cn(
                            "text-sm font-medium truncate",
                            task.status === "done" ? "text-slate-400 dark:text-slate-500 line-through" : "text-slate-900 dark:text-slate-100"
                          )}>
                            {task.title}
                          </span>
                        </div>
                        <div className="px-4 py-3 shrink-0">
                          <select
                            value={task.status}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => onUpdateTask(task.id, { status: e.target.value as Task["status"] })}
                            className="text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          >
                            <option value="todo">To Do</option>
                            <option value="in_progress">In Progress</option>
                            <option value="done">Done</option>
                          </select>
                        </div>
                        <div className="px-4 py-3 shrink-0">
                          <select
                            value={task.priority}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => onUpdateTask(task.id, { priority: e.target.value as Task["priority"] })}
                            className="text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="urgent">Urgent</option>
                          </select>
                        </div>
                        <div className="px-4 py-3 shrink-0">
                          <input
                            type="date"
                            value={task.due_date || ""}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => onUpdateTask(task.id, { due_date: e.target.value || null })}
                            className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                        <div className="px-4 py-3 text-right shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteTask(task.id);
                            }}
                            className="p-1 rounded text-slate-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </Draggable>
                ))
              )}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}
