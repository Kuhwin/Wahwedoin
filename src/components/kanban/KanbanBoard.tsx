"use client";

import { useState } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { Plus, MoreHorizontal, Trash2, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRIORITY_CONFIG, type Task } from "@/lib/types";

interface KanbanBoardProps {
  tasks: Task[];
  onUpdateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
}

const COLUMNS = [
  { id: "todo", title: "To Do", color: "bg-slate-500" },
  { id: "in_progress", title: "In Progress", color: "bg-blue-500" },
  { id: "done", title: "Done", color: "bg-green-500" },
] as const;

export default function KanbanBoard({ tasks, onUpdateTask, onDeleteTask }: KanbanBoardProps) {
  const [menuTaskId, setMenuTaskId] = useState<string | null>(null);

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const newStatus = result.destination.droppableId as Task["status"];
    const taskId = result.draggableId;
    onUpdateTask(taskId, { status: newStatus });
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COLUMNS.map((column) => {
          const columnTasks = tasks.filter((t) => t.status === column.id);
          return (
            <div key={column.id} className="flex flex-col">
              {/* Column Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={cn("h-2.5 w-2.5 rounded-full", column.color)} />
                  <h3 className="text-sm font-semibold text-slate-700">{column.title}</h3>
                  <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
                    {columnTasks.length}
                  </span>
                </div>
              </div>

              {/* Droppable Area */}
              <Droppable droppableId={column.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      "flex-1 min-h-[200px] rounded-xl p-2 space-y-2 transition-colors",
                      snapshot.isDraggingOver ? "bg-indigo-50" : "bg-slate-50"
                    )}
                  >
                    {columnTasks.map((task, index) => (
                      <Draggable key={task.id} draggableId={task.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={cn(
                              "bg-white border border-slate-200 rounded-xl p-3 shadow-sm hover:shadow-md transition-all group relative",
                              snapshot.isDragging && "shadow-lg ring-2 ring-indigo-200"
                            )}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-2 flex-1 min-w-0">
                                <div
                                  {...provided.dragHandleProps}
                                  className="mt-0.5 text-slate-300 hover:text-slate-500 cursor-grab"
                                >
                                  <GripVertical size={14} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-slate-900 truncate">
                                    {task.title}
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
                                      <span className="text-[10px] text-slate-400">
                                        {new Date(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Task Menu */}
                              <div className="relative">
                                <button
                                  onClick={() => setMenuTaskId(menuTaskId === task.id ? null : task.id)}
                                  className="p-1 rounded text-slate-300 hover:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <MoreHorizontal size={14} />
                                </button>
                                {menuTaskId === task.id && (
                                  <>
                                    <div className="fixed inset-0 z-10" onClick={() => setMenuTaskId(null)} />
                                    <div className="absolute right-0 top-8 z-20 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[120px]">
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
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
