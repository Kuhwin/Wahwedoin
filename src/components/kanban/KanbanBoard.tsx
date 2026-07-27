"use client";

import { useState, useRef, useEffect, memo } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Pencil,
  FolderOpen,
  Check,
  X,
  MoveRight,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PRIORITY_CONFIG, type Task, type Section, type TeamMember } from "@/lib/types";
import Button from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";

interface KanbanBoardProps {
  tasks: Task[];
  sections: Section[];
  subtaskCounts?: Record<string, { total: number; done: number }>;
  teamMembers?: TeamMember[];
  memberProfiles?: Record<string, string>;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onAddTask?: (task: Partial<Task>) => Promise<void>;
  onAddSection: (name: string) => Promise<void>;
  onUpdateSection: (sectionId: string, updates: Partial<Section>) => Promise<void>;
  onDeleteSection: (sectionId: string) => Promise<void>;
  onTaskClick?: (task: Task) => void;
  onBulkDelete?: (taskIds: string[]) => Promise<void>;
  onBulkMove?: (taskIds: string[], sectionId: string) => Promise<void>;
  onBulkAssign?: (taskIds: string[], userId: string) => Promise<void>;
}

const PRIORITY_BORDER: Record<Task["priority"], string> = {
  low: "border-l-slate-400",
  medium: "border-l-blue-500",
  high: "border-l-orange-500",
  urgent: "border-l-red-500",
};

function mapPositionToStatus(position: number, total: number): Task["status"] {
  if (total <= 1) return "todo";
  if (position === 0) return "todo";
  if (position >= total - 1) return "done";
  return "in_progress";
}

function getStatusForSection(
  sectionId: string,
  sections: Section[]
): Task["status"] {
  const sorted = [...sections].sort((a, b) => a.position - b.position);
  const idx = sorted.findIndex((s) => s.id === sectionId);
  return mapPositionToStatus(idx, sorted.length);
}

function KanbanBoardInner({
  tasks,
  sections,
  subtaskCounts = {},
  teamMembers = [],
  memberProfiles = {},
  onUpdateTask,
  onDeleteTask,
  onAddTask,
  onAddSection,
  onUpdateSection,
  onDeleteSection,
  onTaskClick,
  onBulkDelete,
  onBulkMove,
  onBulkAssign,
}: KanbanBoardProps) {
  const [menuTaskId, setMenuTaskId] = useState<string | null>(null);
  const [menuSectionId, setMenuSectionId] = useState<string | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editSectionName, setEditSectionName] = useState("");
  const [newSectionName, setNewSectionName] = useState("");
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [quickAddSectionId, setQuickAddSectionId] = useState<string | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [bulkMoveSectionId, setBulkMoveSectionId] = useState<string>("");
  const [showBulkMove, setShowBulkMove] = useState(false);
  const [bulkAssignUserId, setBulkAssignUserId] = useState<string>("");
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);
  const addSectionInputRef = useRef<HTMLInputElement>(null);
  const quickAddInputRef = useRef<HTMLInputElement>(null);

  const sortedSections = [...sections].sort((a, b) => a.position - b.position);
  const hasSelection = selectedTaskIds.size > 0;

  useEffect(() => {
    if (editingSectionId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingSectionId]);

  useEffect(() => {
    if (isAddingSection && addSectionInputRef.current) {
      addSectionInputRef.current.focus();
    }
  }, [isAddingSection]);

  useEffect(() => {
    if (quickAddSectionId && quickAddInputRef.current) {
      quickAddInputRef.current.focus();
    }
  }, [quickAddSectionId]);

  function toggleSelect(taskId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function toggleSelectAll(sectionId: string) {
    const sectionTaskIds = tasks
      .filter((t) => t.section_id === sectionId)
      .map((t) => t.id);
    const allSelected = sectionTaskIds.every((id) => selectedTaskIds.has(id));
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        sectionTaskIds.forEach((id) => next.delete(id));
      } else {
        sectionTaskIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  async function handleBulkDelete() {
    if (!onBulkDelete || selectedTaskIds.size === 0) return;
    await onBulkDelete(Array.from(selectedTaskIds));
    setSelectedTaskIds(new Set());
  }

  async function handleBulkMove() {
    if (!onBulkMove || !bulkMoveSectionId || selectedTaskIds.size === 0) return;
    await onBulkMove(Array.from(selectedTaskIds), bulkMoveSectionId);
    setSelectedTaskIds(new Set());
    setShowBulkMove(false);
    setBulkMoveSectionId("");
  }

  async function handleBulkAssign() {
    if (!onBulkAssign || !bulkAssignUserId || selectedTaskIds.size === 0) return;
    await onBulkAssign(Array.from(selectedTaskIds), bulkAssignUserId);
    setSelectedTaskIds(new Set());
    setShowBulkAssign(false);
    setBulkAssignUserId("");
  }

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const taskId = result.draggableId;
    const newSectionId = result.destination.droppableId;
    const status = getStatusForSection(newSectionId, sections);
    onUpdateTask(taskId, { section_id: newSectionId, status });
  }

  async function handleAddSection() {
    const name = newSectionName.trim();
    if (!name) return;
    await onAddSection(name);
    setNewSectionName("");
    setIsAddingSection(false);
  }

  async function handleRenameSection() {
    if (!editingSectionId) return;
    const name = editSectionName.trim();
    if (!name) return;
    await onUpdateSection(editingSectionId, { name });
    setEditingSectionId(null);
    setEditSectionName("");
  }

  async function handleQuickAdd(sectionId: string) {
    const title = quickAddTitle.trim();
    if (!title) return;
    const status = getStatusForSection(sectionId, sections);
    const tasksInSection = tasks.filter((t) => t.section_id === sectionId);
    if (onAddTask) {
      await onAddTask({
        title,
        status,
        section_id: sectionId,
        position: tasksInSection.length,
        priority: "medium",
      });
    } else {
      await onUpdateTask(
        crypto.randomUUID(),
        {
          title,
          status,
          section_id: sectionId,
          position: tasksInSection.length,
          priority: "medium",
        } as Partial<Task>
      );
    }
    setQuickAddTitle("");
    setQuickAddSectionId(null);
  }

  if (sections.length === 0 && !isAddingSection) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center mb-4">
          <FolderOpen className="text-indigo-400" size={28} />
        </div>
        <h3 className="text-lg font-semibold text-slate-800 mb-1">
          Create your first section
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-sm">
          Sections help you organize tasks into columns on the board.
        </p>
        <button
          onClick={() => setIsAddingSection(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus size={16} />
          Add Section
        </button>
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      {/* Bulk Action Bar */}
      {hasSelection && (
        <div className="mb-4 flex items-center gap-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl px-4 py-2.5 animate-in fade-in slide-in-from-top-2">
          <span className="text-sm font-medium text-indigo-700 dark:text-indigo-400">
            {selectedTaskIds.size} task{selectedTaskIds.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2 ml-auto">
            {showBulkMove ? (
              <div className="flex items-center gap-2">
                <select
                  value={bulkMoveSectionId}
                  onChange={(e) => setBulkMoveSectionId(e.target.value)}
                  className="text-sm border border-indigo-300 rounded-lg px-2 py-1 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Select section...</option>
                  {sortedSections.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <Button variant="primary" onClick={() => void handleBulkMove()} disabled={!bulkMoveSectionId} className="!py-1 !px-2 !text-xs">
                  Move
                </Button>
                <Button variant="ghost" onClick={() => { setShowBulkMove(false); setBulkMoveSectionId(""); }} className="!py-1 !px-2 !text-xs">
                  Cancel
                </Button>
              </div>
            ) : showBulkAssign ? (
              <div className="flex items-center gap-2">
                <select
                  value={bulkAssignUserId}
                  onChange={(e) => setBulkAssignUserId(e.target.value)}
                  className="text-sm border border-indigo-300 rounded-lg px-2 py-1 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Select person...</option>
                  {teamMembers.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {memberProfiles[m.user_id] || m.user_email || m.user_id}
                    </option>
                  ))}
                </select>
                <Button variant="primary" onClick={() => void handleBulkAssign()} disabled={!bulkAssignUserId} className="!py-1 !px-2 !text-xs">
                  Assign
                </Button>
                <Button variant="ghost" onClick={() => { setShowBulkAssign(false); setBulkAssignUserId(""); }} className="!py-1 !px-2 !text-xs">
                  Cancel
                </Button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setShowBulkMove(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-400 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <MoveRight size={12} />
                  Move to...
                </button>
                {onBulkAssign && teamMembers.length > 0 && (
                  <button
                    onClick={() => setShowBulkAssign(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-400 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <User size={12} />
                    Assign...
                  </button>
                )}
                {onBulkDelete && (
                  <button
                    onClick={() => void handleBulkDelete()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-white dark:bg-slate-900 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                )}
              </>
            )}
            <button
              onClick={() => setSelectedTaskIds(new Set())}
              className="p-1.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
              title="Clear selection"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-4 overflow-x-auto pb-4">
        {sortedSections.map((section) => {
          const columnTasks = tasks.filter((t) => t.section_id === section.id);
          const isEditing = editingSectionId === section.id;
          const allInSectionSelected = columnTasks.length > 0 && columnTasks.every((t) => selectedTaskIds.has(t.id));

          return (
            <div
              key={section.id}
              className="flex flex-col w-[300px] min-w-[300px]"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={() => toggleSelectAll(section.id)}
                    className={cn(
                      "w-4 h-4 rounded border shrink-0 transition-colors flex items-center justify-center",
                      allInSectionSelected
                        ? "bg-indigo-600 border-indigo-600 text-white"
                        : "border-slate-300 dark:border-slate-600 hover:border-indigo-400"
                    )}
                    title={allInSectionSelected ? "Deselect all in section" : "Select all in section"}
                  >
                    {allInSectionSelected && <Check size={10} />}
                  </button>
                  <div
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: section.color }}
                  />
                  {isEditing ? (
                    <div className="flex items-center gap-1">
                      <input
                        ref={editInputRef}
                        value={editSectionName}
                        onChange={(e) => setEditSectionName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameSection();
                          if (e.key === "Escape") setEditingSectionId(null);
                        }}
                        className="text-sm font-semibold text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-32"
                      />
                      <button
                        onClick={handleRenameSection}
                        className="p-0.5 text-green-600 hover:bg-green-50 rounded"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => setEditingSectionId(null)}
                        className="p-0.5 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 truncate">
                      {section.name}
                    </h3>
                  )}
                  <span className="text-xs text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-full shrink-0">
                    {columnTasks.length}
                  </span>
                </div>

                {/* Section Menu */}
                <div className="relative shrink-0">
                  <button
                    onClick={() =>
                      setMenuSectionId(
                        menuSectionId === section.id ? null : section.id
                      )
                    }
                    className="p-1 rounded text-slate-300 dark:text-slate-600 hover:text-slate-500 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  >
                    <MoreHorizontal size={14} />
                  </button>
                  {menuSectionId === section.id && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setMenuSectionId(null)}
                      />
                      <div className="absolute right-0 top-8 z-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 min-w-[140px]">
                        <button
                          onClick={() => {
                            setEditingSectionId(section.id);
                            setEditSectionName(section.name);
                            setMenuSectionId(null);
                          }}
                          className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <Pencil size={12} />
                          Rename
                        </button>
                        <button
                          onClick={() => {
                            onDeleteSection(section.id);
                            setMenuSectionId(null);
                          }}
                          className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                        >
                          <Trash2 size={12} />
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Droppable Area */}
              <Droppable droppableId={section.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      "flex-1 min-h-[200px] rounded-xl p-2 space-y-2 transition-colors",
                      snapshot.isDraggingOver ? "bg-indigo-50 dark:bg-indigo-900/20" : "bg-slate-50 dark:bg-slate-800"
                    )}
                  >
                    {columnTasks.map((task, index) => {
                      const isSelected = selectedTaskIds.has(task.id);
                      return (
                        <Draggable
                          key={task.id}
                          draggableId={task.id}
                          index={index}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              onClick={() => onTaskClick?.(task)}
                              className={cn(
                                "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 border-l-4 rounded-xl p-3 shadow-sm hover:shadow-md transition-all group relative cursor-grab active:cursor-grabbing",
                                PRIORITY_BORDER[task.priority],
                                isSelected && "ring-2 ring-indigo-300 bg-indigo-50/50",
                                snapshot.isDragging &&
                                  "shadow-lg ring-2 ring-indigo-200"
                              )}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex items-start gap-2 flex-1 min-w-0">
                                  <button
                                    onClick={(e) => toggleSelect(task.id, e)}
                                    className={cn(
                                      "mt-0.5 w-4 h-4 rounded border shrink-0 transition-colors flex items-center justify-center",
                                      isSelected
                                        ? "bg-indigo-600 border-indigo-600 text-white"
                                        : "border-slate-300 dark:border-slate-600 hover:border-indigo-400"
                                    )}
                                  >
                                    {isSelected && <Check size={10} />}
                                  </button>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate flex items-center gap-1">
                                      {task.title}
                                      {task.is_milestone && <span className="ml-1 text-amber-500" title="Milestone">◆</span>}
                                      {task.recurrence && <span title={`Repeats ${task.recurrence}`}>🔁</span>}
                                    </p>
                                    <div className="flex items-center gap-2 mt-2">
                                      <span
                                        className={cn(
                                          "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                                          PRIORITY_CONFIG[task.priority].color
                                        )}
                                      >
                                        {PRIORITY_CONFIG[task.priority].label}
                                      </span>
                                      {task.due_date && (
                                        <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                          {new Date(
                                            task.due_date
                                          ).toLocaleDateString("en-US", {
                                            month: "short",
                                            day: "numeric",
                                          })}
                                        </span>
                                      )}
                                       {subtaskCounts[task.id] && subtaskCounts[task.id].total > 0 && (
                                        <span className="flex items-center gap-1.5">
                                          <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                            <div
                                              className="h-full rounded-full bg-green-500"
                                              style={{ width: `${Math.round((subtaskCounts[task.id].done / subtaskCounts[task.id].total) * 100)}%` }}
                                            />
                                          </div>
                                          <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                            {subtaskCounts[task.id].done}/{subtaskCounts[task.id].total}
                                          </span>
                                        </span>
                                       )}
                                       {task.assignee_ids && task.assignee_ids.length > 0 && (
                                        <div className="flex items-center -space-x-1 mt-1">
                                          {task.assignee_ids.slice(0, 3).map((uid: string) => (
                                            <Avatar
                                              key={uid}
                                              name={memberProfiles[uid] || uid}
                                              email={uid}
                                              size="sm"
                                              className="ring-2 ring-white dark:ring-slate-900"
                                            />
                                          ))}
                                          {task.assignee_ids.length > 3 && (
                                            <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-1.5">+{task.assignee_ids.length - 3}</span>
                                          )}
                                        </div>
                                       )}
                                       {task.projects && task.projects.length > 0 && (
                                        <div className="flex items-center gap-1">
                                          {task.projects.map((p) => (
                                            <span key={p.id} className="text-[9px] px-1 py-0 rounded font-medium" style={{ backgroundColor: `${p.color}20`, color: p.color }} title={p.name}>
                                              {p.name.length > 8 ? p.name.slice(0, 8) + "…" : p.name}
                                            </span>
                                          ))}
                                        </div>
                                       )}
                                    </div>
                                  </div>
                                </div>

                                {/* Task Menu */}
                                <div className="relative">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setMenuTaskId(
                                        menuTaskId === task.id ? null : task.id
                                      );
                                    }}
                                    className="p-1 rounded text-slate-300 dark:text-slate-600 hover:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <MoreHorizontal size={14} />
                                  </button>
                                  {menuTaskId === task.id && (
                                    <>
                                      <div
                                        className="fixed inset-0 z-10"
                                        onClick={() => setMenuTaskId(null)}
                                      />
                                      <div className="absolute right-0 top-8 z-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 min-w-[120px]">
                                        <button
                                          onClick={() => {
                                            onDeleteTask(task.id);
                                            setMenuTaskId(null);
                                          }}
                                          className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                                        >
                                          <Trash2 size={12} />
                                          Delete
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}

                    {/* Quick Add */}
                    {quickAddSectionId === section.id ? (
                      <div className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-xl p-2 shadow-sm">
                        <input
                          ref={quickAddInputRef}
                          value={quickAddTitle}
                          onChange={(e) => setQuickAddTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleQuickAdd(section.id);
                            if (e.key === "Escape") {
                              setQuickAddSectionId(null);
                              setQuickAddTitle("");
                            }
                          }}
                          placeholder="Task title..."
                          className="w-full text-sm px-2 py-1.5 border-0 focus:outline-none focus:ring-0 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                        />
                        <div className="flex items-center gap-1 mt-1">
                          <button
                            onClick={() => handleQuickAdd(section.id)}
                            disabled={!quickAddTitle.trim()}
                            className="px-2 py-1 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            Add
                          </button>
                          <button
                            onClick={() => {
                              setQuickAddSectionId(null);
                              setQuickAddTitle("");
                            }}
                            className="px-2 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setQuickAddSectionId(section.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-colors"
                      >
                        <Plus size={14} />
                        Add task
                      </button>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}

        {/* Add Section Column */}
        <div className="min-w-[260px]">
          {isAddingSection ? (
            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
              <input
                ref={addSectionInputRef}
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddSection();
                  if (e.key === "Escape") {
                    setIsAddingSection(false);
                    setNewSectionName("");
                  }
                }}
                placeholder="Section name..."
                className="w-full text-sm font-medium px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={handleAddSection}
                  disabled={!newSectionName.trim()}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setIsAddingSection(false);
                    setNewSectionName("");
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsAddingSection(true)}
              className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-slate-400 dark:text-slate-500 hover:text-slate-600 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              <Plus size={16} />
              Add Section
            </button>
          )}
        </div>
      </div>
    </DragDropContext>
  );
}

export default memo(KanbanBoardInner);
