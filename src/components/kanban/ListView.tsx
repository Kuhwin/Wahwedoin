"use client";

import { useState, useMemo, memo } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { Trash2, Check, X, CheckSquare, ChevronRight, ChevronDown, UserPlus } from "lucide-react";
import { type Task } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AssigneeOption {
  id: string;
  name: string;
}

interface ListViewProps {
  tasks: Task[];
  onUpdateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onTaskClick?: (task: Task) => void;
  onBulkDelete?: (taskIds: string[]) => Promise<void>;
  onBulkMove?: (taskIds: string[], sectionId: string) => Promise<void>;
  onBulkAssign?: (taskIds: string[], userId: string) => Promise<void>;
  assignees?: AssigneeOption[];
  subtaskCounts?: Record<string, { total: number; done: number }>;
}

function ListViewInner({
  tasks,
  onUpdateTask,
  onDeleteTask,
  onTaskClick,
  onBulkDelete,
  onBulkAssign,
  assignees = [],
  subtaskCounts = {},
}: ListViewProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkStatus, setShowBulkStatus] = useState(false);
  const [showBulkPriority, setShowBulkPriority] = useState(false);
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(new Set());

  const allSelected = tasks.length > 0 && tasks.every((t) => selectedIds.has(t.id));
  const hasSelection = selectedIds.size > 0;

  const { displayTasks, taskDepth } = useMemo(() => {
    const parents: Task[] = [];
    const subtasksByParent = new Map<string, Task[]>();
    const depth = new Map<string, number>();

    for (const t of tasks) {
      if (t.parent_id) {
        if (!subtasksByParent.has(t.parent_id)) subtasksByParent.set(t.parent_id, []);
        subtasksByParent.get(t.parent_id)!.push(t);
        depth.set(t.id, 1);
      } else {
        parents.push(t);
        depth.set(t.id, 0);
      }
    }

    const display: Task[] = [];
    for (const parent of parents) {
      display.push(parent);
      if (!collapsedParents.has(parent.id)) {
        const subs = subtasksByParent.get(parent.id) || [];
        for (const sub of subs) display.push(sub);
      }
    }

    return { displayTasks: display, taskDepth: depth };
  }, [tasks, collapsedParents]);

  function toggleCollapse(parentId: string) {
    setCollapsedParents((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  }

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
      setSelectedIds(new Set(displayTasks.map((t) => t.id)));
    }
  }

  async function handleBulkStatus(status: Task["status"]) {
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

  async function handleBulkAssign(userId: string) {
    if (!onBulkAssign || !userId) return;
    await onBulkAssign(Array.from(selectedIds), userId);
    setSelectedIds(new Set());
    setShowBulkAssign(false);
  }

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const destIndex = result.destination.index;
    const sourceIndex = result.source.index;
    if (destIndex === sourceIndex) return;

    const ordered = [...displayTasks];
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

  const GRID = "grid-cols-[40px_1fr_130px_110px_140px_60px]";

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      {/* Bulk Action Bar */}
      {hasSelection && (
        <div className="flex flex-wrap items-center gap-3 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-200 dark:border-indigo-800 px-4 py-2.5">
          <span className="text-sm font-medium text-indigo-700 dark:text-indigo-400">
            {selectedIds.size} task{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            {showBulkStatus ? (
              <div className="flex items-center gap-2">
                {(["todo", "in_progress", "done"] as const).map((s) => (
                  <button key={s} onClick={() => void handleBulkStatus(s)} className="text-xs font-medium px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors">
                    {s === "todo" ? "To Do" : s === "in_progress" ? "In Progress" : "Done"}
                  </button>
                ))}
                <button onClick={() => setShowBulkStatus(false)} className="p-1 text-indigo-400 hover:text-accent"><X size={12} /></button>
              </div>
            ) : showBulkPriority ? (
              <div className="flex items-center gap-2">
                {(["low", "medium", "high", "urgent"] as const).map((p) => (
                  <button key={p} onClick={() => void handleBulkPriority(p)} className="text-xs font-medium px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors capitalize">
                    {p}
                  </button>
                ))}
                <button onClick={() => setShowBulkPriority(false)} className="p-1 text-indigo-400 hover:text-accent"><X size={12} /></button>
              </div>
            ) : showBulkAssign ? (
              <div className="flex items-center gap-2">
                <select
                  autoFocus
                  value=""
                  onChange={(e) => { if (e.target.value) void handleBulkAssign(e.target.value); }}
                  onBlur={() => setShowBulkAssign(false)}
                  className="text-xs font-medium bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-lg px-2 py-1 text-indigo-700 dark:text-indigo-400 focus:outline-none focus:ring-1 focus:ring-accent/50"
                >
                  <option value="" disabled>Assign to...</option>
                  {assignees.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <button onClick={() => setShowBulkAssign(false)} className="p-1 text-indigo-400 hover:text-accent"><X size={12} /></button>
              </div>
            ) : (
              <>
                <button onClick={() => setShowBulkStatus(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-400 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors">
                  <CheckSquare size={12} /> Set Status...
                </button>
                <button onClick={() => setShowBulkPriority(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-400 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors">
                  Priority...
                </button>
                {onBulkAssign && assignees.length > 0 && (
                  <button onClick={() => setShowBulkAssign(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-400 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors">
                    <UserPlus size={12} /> Assign...
                  </button>
                )}
                {onBulkDelete && (
                  <button onClick={() => void handleBulkDeleteAction()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-white dark:bg-slate-900 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                    <Trash2 size={12} /> Delete
                  </button>
                )}
              </>
            )}
            <button onClick={() => setSelectedIds(new Set())} className="p-1.5 text-indigo-400 hover:text-accent hover:bg-accent/15 dark:hover:bg-accent/20 rounded-lg transition-colors" title="Clear selection">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Table scroll on small screens */}
      <div className="overflow-x-auto">
        {/* Header */}
        <div className={cn("grid items-center min-w-[720px] border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800", GRID)}>
        <div className="flex items-center justify-center px-2 py-3">
          <button
            onClick={toggleSelectAll}
            className={cn(
              "w-4 h-4 rounded border shrink-0 transition-colors flex items-center justify-center",
              allSelected ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-300 dark:border-slate-600 hover:border-accent/50"
            )}
          >
            {allSelected && <Check size={10} />}
          </button>
        </div>
        <div className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider px-2 py-3">Task</div>
        <div className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider px-2 py-3">Status</div>
        <div className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider px-2 py-3">Priority</div>
        <div className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider px-2 py-3">Due Date</div>
        <div className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider px-2 py-3">Actions</div>
      </div>

      {/* Rows */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="list-view">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps}>
              {displayTasks.length === 0 ? (
                <div className="text-center py-8 text-sm text-slate-500 dark:text-slate-400">
                  No tasks yet. Add one to get started.
                </div>
              ) : (
                displayTasks.map((task, index) => {
                  const isSelected = selectedIds.has(task.id);
                  const depth = taskDepth.get(task.id) || 0;
                  const isSubtask = depth > 0;
                  const hasSubtasks = subtaskCounts[task.id] && subtaskCounts[task.id].total > 0;
                  const isCollapsed = collapsedParents.has(task.id);

                  if (isSubtask) {
                    return (
                      <Draggable key={task.id} draggableId={task.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={cn(
                              "flex items-center border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-grab active:cursor-grabbing",
                              "bg-slate-50/60 dark:bg-slate-800/20",
                              snapshot.isDragging && "bg-indigo-50 dark:bg-indigo-900/20 shadow-lg ring-1 ring-indigo-200 dark:ring-indigo-800",
                              isSelected && "bg-indigo-50 dark:bg-indigo-900/20"
                            )}
                          >
                            {/* Checkbox */}
                            <div className="flex items-center justify-center px-2 py-2 w-[40px] shrink-0">
                              <button
                                onClick={(e) => toggleSelect(task.id, e)}
                                className={cn(
                                  "h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 transition-colors",
                                  isSelected ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-300 dark:border-slate-600 hover:border-accent/50"
                                )}
                              >
                                {isSelected && <Check size={8} />}
                              </button>
                            </div>
                            {/* Task name — indented */}
                            <div
                              className="flex items-center gap-2 px-2 py-2 cursor-pointer min-w-0 flex-1"
                              onClick={() => onTaskClick?.(task)}
                            >
                              <span className="text-slate-300 dark:text-slate-600 text-[10px] shrink-0 font-mono">└─</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateTask(task.id, { status: task.status === "done" ? "todo" : "done" });
                                }}
                                className={cn(
                                  "h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0",
                                  task.status === "done" ? "bg-green-500 border-green-500" : "border-slate-300 dark:border-slate-600"
                                )}
                              >
                                {task.status === "done" && (
                                  <svg className="h-2 w-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </button>
                              <span className={cn(
                                "text-sm truncate",
                                task.status === "done" ? "text-slate-400 dark:text-slate-500 line-through" : "text-slate-600 dark:text-slate-300"
                              )}>
                                {task.title}
                              </span>
                            </div>
                            {/* Spacer — fills remaining columns */}
                            <div className="flex-1" />
                            {/* Delete only */}
                            <div className="px-2 py-2 shrink-0">
                              <button
                                onClick={(e) => { e.stopPropagation(); onDeleteTask(task.id); }}
                                className="p-1 rounded text-slate-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    );
                  }

                  // Parent task — full grid row
                  return (
                    <Draggable key={task.id} draggableId={task.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={cn(
                            "grid items-center min-w-[720px] border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-grab active:cursor-grabbing",
                            snapshot.isDragging && "bg-indigo-50 dark:bg-indigo-900/20 shadow-lg ring-1 ring-indigo-200 dark:ring-indigo-800",
                            isSelected && "bg-indigo-50 dark:bg-indigo-900/20"
                          )}
                          style={{ ...provided.draggableProps.style, gridTemplateColumns: "40px 1fr 130px 110px 140px 60px" }}
                        >
                          {/* Checkbox */}
                          <div className="flex items-center justify-center px-2 py-3">
                            <button
                              onClick={(e) => toggleSelect(task.id, e)}
                              className={cn(
                                "h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                                isSelected ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-300 dark:border-slate-600 hover:border-accent/50"
                              )}
                            >
                              {isSelected && <Check size={10} />}
                            </button>
                          </div>

                          {/* Task name */}
                          <div className="flex items-center gap-2 px-2 py-3 cursor-pointer min-w-0" onClick={() => onTaskClick?.(task)}>
                            {hasSubtasks ? (
                              <button onClick={(e) => { e.stopPropagation(); toggleCollapse(task.id); }} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 shrink-0">
                                {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                              </button>
                            ) : (
                              <span className="w-3.5 shrink-0" />
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onUpdateTask(task.id, { status: task.status === "done" ? "todo" : "done" });
                              }}
                              className={cn(
                                "h-4 w-4 rounded border-2 flex items-center justify-center shrink-0",
                                task.status === "done" ? "bg-green-500 border-green-500" : "border-slate-300 dark:border-slate-600"
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
                              {hasSubtasks && (
                                <span className="ml-2 flex items-center gap-1.5">
                                  <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full bg-green-500" style={{ width: `${Math.round((subtaskCounts[task.id].done / subtaskCounts[task.id].total) * 100)}%` }} />
                                  </div>
                                  <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                    {subtaskCounts[task.id].done}/{subtaskCounts[task.id].total}
                                  </span>
                                </span>
                              )}
                            </span>
                          </div>

                          {/* Status */}
                          <div className="px-2 py-3">
                            <select
                              value={task.status}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => onUpdateTask(task.id, { status: e.target.value as Task["status"] })}
                              className="text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-accent/50 w-full"
                            >
                              <option value="todo">To Do</option>
                              <option value="in_progress">In Progress</option>
                              <option value="done">Done</option>
                            </select>
                          </div>

                          {/* Priority */}
                          <div className="px-2 py-3">
                            <select
                              value={task.priority}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => onUpdateTask(task.id, { priority: e.target.value as Task["priority"] })}
                              className="text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-accent/50 w-full"
                            >
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                              <option value="urgent">Urgent</option>
                            </select>
                          </div>

                          {/* Due Date */}
                          <div className="px-2 py-3">
                            <input
                              type="date"
                              value={task.due_date || ""}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => onUpdateTask(task.id, { due_date: e.target.value || null })}
                              className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-accent/50 w-full"
                            />
                          </div>

                          {/* Actions */}
                          <div className="px-2 py-3 text-right">
                            <button
                              onClick={(e) => { e.stopPropagation(); onDeleteTask(task.id); }}
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
    </div>
  );
}

export default memo(ListViewInner);
