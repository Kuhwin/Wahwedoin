"use client";

import { useState } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { Trash2, Check, X, CheckSquare } from "lucide-react";
import { type Task } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ListViewProps {
  tasks: Task[];
  onUpdateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onTaskClick?: (task: Task) => void;
  onBulkDelete?: (taskIds: string[]) => Promise<void>;
  onBulkMove?: (taskIds: string[], sectionId: string) => Promise<void>;
  onBulkAssign?: (taskIds: string[], userId: string) => Promise<void>;
}

export default function ListView({
  tasks,
  onUpdateTask,
  onDeleteTask,
  onTaskClick,
  onBulkDelete,
  onBulkMove,
  onBulkAssign,
}: ListViewProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkStatus, setShowBulkStatus] = useState(false);
  const [showBulkPriority, setShowBulkPriority] = useState(false);

  const allSelected = tasks.length > 0 && tasks.every((t) => selectedIds.has(t.id));
  const hasSelection = selectedIds.size > 0;

  function toggleSelect(taskId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tasks.map((t) => t.id)));
    }
  }

  async function handleBulkStatus(status: Task["status"]) {
    if (!onBulkDelete && selectedIds.size === 0) return;
    const updates = Array.from(selectedIds).map((id) => onUpdateTask(id, { status }));
    await Promise.all(updates);
    setSelectedIds(new Set());
    setShowBulkStatus(false);
  }

  async function handleBulkPriority(priority: Task["priority"]) {
    const updates = Array.from(selectedIds).map((id) => onUpdateTask(id, { priority }));
    await Promise.all(updates);
    setSelectedIds(new Set());
    setShowBulkPriority(false);
  }

  async function handleBulkDeleteAction() {
    if (!onBulkDelete) return;
    await onBulkDelete(Array.from(selectedIds));
    setSelectedIds(new Set());
  }

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
      {/* Bulk Action Bar */}
      {hasSelection && (
        <div className="flex items-center gap-3 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-200 dark:border-indigo-800 px-4 py-2.5">
          <span className="text-sm font-medium text-indigo-700 dark:text-indigo-400">
            {selectedIds.size} task{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2 ml-auto">
            {showBulkStatus ? (
              <div className="flex items-center gap-2">
                {(["todo", "in_progress", "done"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => void handleBulkStatus(s)}
                    className="text-xs font-medium px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    {s === "todo" ? "To Do" : s === "in_progress" ? "In Progress" : "Done"}
                  </button>
                ))}
                <button onClick={() => setShowBulkStatus(false)} className="p-1 text-indigo-400 hover:text-indigo-600"><X size={12} /></button>
              </div>
            ) : showBulkPriority ? (
              <div className="flex items-center gap-2">
                {(["low", "medium", "high", "urgent"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => void handleBulkPriority(p)}
                    className="text-xs font-medium px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors capitalize"
                  >
                    {p}
                  </button>
                ))}
                <button onClick={() => setShowBulkPriority(false)} className="p-1 text-indigo-400 hover:text-indigo-600"><X size={12} /></button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setShowBulkStatus(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-400 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <CheckSquare size={12} />
                  Set Status...
                </button>
                <button
                  onClick={() => setShowBulkPriority(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-400 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Priority...
                </button>
                {onBulkDelete && (
                  <button
                    onClick={() => void handleBulkDeleteAction()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-white dark:bg-slate-900 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                )}
              </>
            )}
            <button
              onClick={() => setSelectedIds(new Set())}
              className="p-1.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
              title="Clear selection"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
            <th className="w-10 px-4 py-3">
              <button
                onClick={toggleSelectAll}
                className={cn(
                  "w-4 h-4 rounded border shrink-0 transition-colors flex items-center justify-center",
                  allSelected
                    ? "bg-indigo-600 border-indigo-600 text-white"
                    : "border-slate-300 dark:border-slate-600 hover:border-indigo-400"
                )}
              >
                {allSelected && <Check size={10} />}
              </button>
            </th>
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
                tasks.map((task, index) => {
                  const isSelected = selectedIds.has(task.id);
                  return (
                    <Draggable key={task.id} draggableId={task.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={cn(
                            "flex items-center border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-grab active:cursor-grabbing",
                            snapshot.isDragging && "bg-indigo-50 dark:bg-indigo-900/20 shadow-lg ring-1 ring-indigo-200 dark:ring-indigo-800",
                            isSelected && "bg-indigo-50 dark:bg-indigo-900/20"
                          )}
                        >
                          <div
                            className="flex-1 flex items-center gap-3 px-4 py-3 cursor-pointer min-w-0"
                            onClick={() => onTaskClick?.(task)}
                          >
                            <button
                              onClick={(e) => toggleSelect(task.id, e)}
                              className={cn(
                                "h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                                isSelected
                                  ? "bg-indigo-600 border-indigo-600 text-white"
                                  : "border-slate-300 dark:border-slate-600 hover:border-indigo-400"
                              )}
                            >
                              {isSelected && <Check size={10} />}
                            </button>
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
                              {task.is_milestone && <span className="ml-1 text-amber-500" title="Milestone">◆</span>}
                              {task.recurrence && <span className="ml-1" title={`Repeats ${task.recurrence}`}>🔁</span>}
                              {task.projects && task.projects.length > 0 && (
                                <span className="ml-2 inline-flex items-center gap-1">
                                  {task.projects.map((p) => (
                                    <span key={p.id} className="text-[9px] px-1 py-0 rounded font-medium" style={{ backgroundColor: `${p.color}20`, color: p.color }} title={p.name}>
                                      {p.name.length > 10 ? p.name.slice(0, 10) + "…" : p.name}
                                    </span>
                                  ))}
                                </span>
                              )}
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
                  );
                })
              )}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}
