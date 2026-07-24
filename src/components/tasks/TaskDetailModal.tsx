"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  MessageSquare,
  Check,
  Plus,
  Trash2,
  X,
  Tag,
  ListTodo,
  History,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import {
  type Task,
  type TaskComment,
  type Tag as TagType,
  type Activity,
} from "@/lib/types";
import { formatRelativeTime, cn } from "@/lib/utils";

interface TaskDetailModalProps {
  task: Task | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (taskId: string, updates: Partial<Task>) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
  availableTags?: TagType[];
}

export default function TaskDetailModal({
  task,
  open,
  onClose,
  onUpdate,
  onDelete,
  availableTags = [],
}: TaskDetailModalProps) {
  const supabase = createClient();

  // Comments
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newComment, setNewComment] = useState("");

  // Editing
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");

  // Subtasks
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [newSubtask, setNewSubtask] = useState("");
  const subtaskInputRef = useRef<HTMLInputElement>(null);

  // Tags
  const [taskTags, setTaskTags] = useState<TagType[]>([]);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [creatingTag, setCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#6366f1");
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  // Activities
  const [activities, setActivities] = useState<Activity[]>([]);

  // Current user id for activity attribution
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!task) return;
    setEditTitle(task.title);
    setEditDesc(task.description || "");
    setNewSubtask("");
    setCreatingTag(false);
    setNewTagName("");
    setShowTagDropdown(false);

    async function loadAll() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);

      // Comments
      const { data: commentsData } = await supabase
        .from("task_comments")
        .select("*")
        .eq("task_id", task!.id)
        .order("created_at", { ascending: true });
      if (commentsData) setComments(commentsData);

      // Subtasks
      const { data: subtasksData } = await supabase
        .from("tasks")
        .select("*")
        .eq("parent_id", task!.id)
        .order("position", { ascending: true });
      if (subtasksData) setSubtasks(subtasksData);

      // Task tags
      const { data: tagLinks } = await supabase
        .from("task_tags")
        .select("tag_id")
        .eq("task_id", task!.id);
      if (tagLinks && tagLinks.length > 0) {
        const tagIds = tagLinks.map((l: { tag_id: string }) => l.tag_id);
        const { data: tagsData } = await supabase
          .from("tags")
          .select("*")
          .in("id", tagIds);
        if (tagsData) setTaskTags(tagsData);
      } else {
        setTaskTags([]);
      }

      // Activities
      const { data: activityData } = await supabase
        .from("activities")
        .select("*")
        .eq("project_id", task!.project_id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (activityData) setActivities(activityData);
    }

    void loadAll();
  }, [task, supabase]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target as Node)) {
        setShowTagDropdown(false);
      }
    }
    if (showTagDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showTagDropdown]);

  if (!task) return null;

  // --- Comments ---
  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("task_comments")
      .insert({
        task_id: task!.id,
        user_id: user?.id,
        body: newComment.trim(),
      })
      .select()
      .single();

    if (data && !error) {
      setComments([...comments, data]);
      setNewComment("");
    }
  }

  async function handleDeleteComment(commentId: string) {
    const { error } = await supabase.from("task_comments").delete().eq("id", commentId);
    if (!error) {
      setComments(comments.filter((c) => c.id !== commentId));
    }
  }

  // --- Title / Description ---
  async function handleSaveEdit() {
    await onUpdate(task!.id, {
      title: editTitle,
      description: editDesc || null,
    });
    setEditing(false);
  }

  // --- Subtasks ---
  async function handleAddSubtask() {
    if (!newSubtask.trim()) return;
    const maxPos = subtasks.reduce((max, s) => Math.max(max, s.position), -1);
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        project_id: task!.project_id,
        title: newSubtask.trim(),
        status: "todo",
        priority: "medium",
        position: maxPos + 1,
        parent_id: task!.id,
        created_by: currentUserId,
      })
      .select()
      .single();

    if (data && !error) {
      setSubtasks([...subtasks, data]);
      setNewSubtask("");
      subtaskInputRef.current?.focus();
    }
  }

  async function handleToggleSubtask(subtask: Task) {
    const newStatus = subtask.status === "done" ? "todo" : "done";
    const { error } = await supabase
      .from("tasks")
      .update({ status: newStatus })
      .eq("id", subtask.id);

    if (!error) {
      setSubtasks(
        subtasks.map((s) => (s.id === subtask.id ? { ...s, status: newStatus } : s))
      );
    }
  }

  // --- Tags ---
  async function handleAddTag(tagId: string) {
    if (taskTags.some((t) => t.id === tagId)) return;
    const { error } = await supabase
      .from("task_tags")
      .insert({ task_id: task!.id, tag_id: tagId });

    if (!error) {
      const tag = availableTags.find((t) => t.id === tagId);
      if (tag) setTaskTags([...taskTags, tag]);
    }
    setShowTagDropdown(false);
  }

  async function handleRemoveTag(tagId: string) {
    const { error } = await supabase
      .from("task_tags")
      .delete()
      .eq("task_id", task!.id)
      .eq("tag_id", tagId);

    if (!error) {
      setTaskTags(taskTags.filter((t) => t.id !== tagId));
    }
  }

  async function handleCreateTag() {
    if (!newTagName.trim()) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: teamMember } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();
    if (!teamMember) return;

    const { data: tag, error } = await supabase
      .from("tags")
      .insert({
        team_id: teamMember.team_id,
        name: newTagName.trim(),
        color: newTagColor,
      })
      .select()
      .single();

    if (tag && !error) {
      await supabase.from("task_tags").insert({ task_id: task!.id, tag_id: tag.id });
      setTaskTags([...taskTags, tag]);
      setNewTagName("");
      setCreatingTag(false);
    }
  }

  const completedSubtasks = subtasks.filter((s) => s.status === "done").length;
  const totalSubtasks = subtasks.length;

  return (
    <Modal open={open} onClose={onClose} size="lg" title="">
      <div className="space-y-6">
        {/* Title */}
        {editing ? (
          <div className="space-y-3">
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full text-lg font-semibold text-slate-900 border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder="Add a description..."
              className="w-full text-sm text-slate-600 border border-slate-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
              rows={3}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveEdit}>
                Save
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <h2
              className="text-lg font-semibold text-slate-900 cursor-pointer hover:text-indigo-600 transition-colors"
              onClick={() => setEditing(true)}
            >
              {task.title}
            </h2>
            <p
              className="text-sm text-slate-600 mt-2 whitespace-pre-wrap cursor-pointer hover:text-slate-800 transition-colors"
              onClick={() => setEditing(true)}
            >
              {task.description || <span className="text-slate-400 italic">Click to add a description...</span>}
            </p>
          </div>
        )}

        {/* Meta row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500">Status</label>
            <select
              value={task.status}
              onChange={(e) =>
                onUpdate(task.id, { status: e.target.value as Task["status"] })
              }
              className="block w-full text-sm bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500">Priority</label>
            <select
              value={task.priority}
              onChange={(e) =>
                onUpdate(task.id, { priority: e.target.value as Task["priority"] })
              }
              className="block w-full text-sm bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500">Due Date</label>
            <input
              type="date"
              value={task.due_date || ""}
              onChange={(e) =>
                onUpdate(task.id, { due_date: e.target.value || null })
              }
              className="block w-full text-sm bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500">Assignee</label>
            <div className="flex items-center gap-2 pt-1.5">
              {task.assignee_id ? (
                <Badge variant="info" className="max-w-full truncate">
                  {task.assignee_email || task.assignee_name || task.assignee_id.slice(0, 8)}
                </Badge>
              ) : (
                <span className="text-sm text-slate-400 italic">Unassigned</span>
              )}
            </div>
          </div>
        </div>

        {/* Subtasks */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListTodo size={16} className="text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-700">Subtasks</h3>
              {totalSubtasks > 0 && (
                <span className="text-xs text-slate-400">
                  {completedSubtasks}/{totalSubtasks}
                </span>
              )}
            </div>
          </div>

          {totalSubtasks > 0 && (
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                style={{ width: `${(completedSubtasks / totalSubtasks) * 100}%` }}
              />
            </div>
          )}

          <div className="space-y-1">
            {subtasks.map((subtask) => (
              <div
                key={subtask.id}
                className="flex items-center gap-2 group px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <button
                  onClick={() => handleToggleSubtask(subtask)}
                  className={cn(
                    "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                    subtask.status === "done"
                      ? "bg-indigo-500 border-indigo-500"
                      : "border-slate-300 hover:border-indigo-400"
                  )}
                >
                  {subtask.status === "done" && <Check size={10} className="text-white" />}
                </button>
                <span
                  className={cn(
                    "text-sm flex-1",
                    subtask.status === "done"
                      ? "line-through text-slate-400"
                      : "text-slate-700"
                  )}
                >
                  {subtask.title}
                </span>
              </div>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleAddSubtask();
            }}
            className="flex gap-2"
          >
            <input
              ref={subtaskInputRef}
              type="text"
              placeholder="Add subtask..."
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              className="flex-1 text-sm bg-transparent border border-dashed border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-400 placeholder:text-slate-400"
            />
            <Button
              type="submit"
              size="sm"
              variant="ghost"
              disabled={!newSubtask.trim()}
            >
              <Plus size={14} />
            </Button>
          </form>
        </div>

        {/* Tags */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Tag size={16} className="text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-700">Tags</h3>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {taskTags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: tag.color }}
              >
                {tag.name}
                <button
                  onClick={() => void handleRemoveTag(tag.id)}
                  className="ml-0.5 rounded-full hover:bg-white/20 p-0.5 transition-colors"
                >
                  <X size={10} />
                </button>
              </span>
            ))}

            <div className="relative" ref={tagDropdownRef}>
              <button
                onClick={() => setShowTagDropdown(!showTagDropdown)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-dashed border-slate-300 text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
              >
                <Plus size={12} />
                Add tag
              </button>

              {showTagDropdown && (
                <div className="absolute z-50 mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-lg p-2 space-y-1">
                  {creatingTag ? (
                    <div className="space-y-2 p-1">
                      <input
                        autoFocus
                        type="text"
                        placeholder="Tag name"
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleCreateTag();
                          if (e.key === "Escape") setCreatingTag(false);
                        }}
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={newTagColor}
                          onChange={(e) => setNewTagColor(e.target.value)}
                          className="w-6 h-6 rounded cursor-pointer border-0 p-0"
                        />
                        <div className="flex-1 flex gap-1">
                          <Button
                            size="sm"
                            className="text-xs h-7 flex-1"
                            onClick={() => void handleCreateTag()}
                            disabled={!newTagName.trim()}
                          >
                            Create
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs h-7"
                            onClick={() => setCreatingTag(false)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {availableTags
                        .filter((t) => !taskTags.some((tt) => tt.id === t.id))
                        .map((tag) => (
                          <button
                            key={tag.id}
                            onClick={() => void handleAddTag(tag.id)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-slate-700 hover:bg-slate-50 transition-colors text-left"
                          >
                            <span
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: tag.color }}
                            />
                            {tag.name}
                          </button>
                        ))}
                      {availableTags.filter((t) => !taskTags.some((tt) => tt.id === t.id))
                        .length === 0 && (
                        <p className="text-xs text-slate-400 px-2 py-1.5">
                          No more available tags
                        </p>
                      )}
                      <button
                        onClick={() => setCreatingTag(true)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-indigo-600 hover:bg-indigo-50 transition-colors text-left font-medium"
                      >
                        <Plus size={12} />
                        Create new tag
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Activity Log */}
        {activities.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <History size={16} className="text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-700">Activity</h3>
            </div>
            <div className="space-y-0 relative">
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-200" />
              {activities.map((activity) => {
                const isOwn = activity.user_id === currentUserId;
                const userName = isOwn ? "You" : (activity.user_email?.split("@")[0] || "Someone");
                return (
                  <div key={activity.id} className="flex items-start gap-2.5 py-2 relative">
                    <div className="w-[15px] h-[15px] rounded-full bg-slate-200 border-2 border-white shrink-0 mt-0.5 z-10" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-600 leading-relaxed">
                        <span className="font-medium text-slate-800">{userName}</span>{" "}
                        {activity.action}
                        {activity.detail && (
                          <span className="text-slate-500"> {activity.detail}</span>
                        )}
                      </p>
                      <span className="text-[10px] text-slate-400">
                        {formatRelativeTime(activity.created_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Comments */}
        <div className="border-t border-slate-200 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare size={16} className="text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-700">
              Comments ({comments.length})
            </h3>
          </div>

          {comments.length > 0 && (
            <div className="space-y-3 mb-4">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-3 group">
                  <Avatar email={comment.user_email || comment.user_id} size="sm" />
                  <div className="flex-1 bg-slate-50 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-700">
                        {comment.user_email || "Unknown"}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400">
                          {formatRelativeTime(comment.created_at)}
                        </span>
                        <button
                          onClick={() => void handleDeleteComment(comment.id)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-300 hover:text-red-500 transition-opacity"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">
                      {comment.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={(e) => void handleAddComment(e)} className="flex gap-2">
            <input
              type="text"
              placeholder="Write a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="flex-1 text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <Button type="submit" size="sm" disabled={!newComment.trim()}>
              <Plus size={14} />
            </Button>
          </form>
        </div>

        {/* Delete */}
        <div className="pt-2 border-t border-slate-200">
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              void onDelete(task.id);
              onClose();
            }}
          >
            <Trash2 size={14} />
            Delete Task
          </Button>
        </div>
      </div>
    </Modal>
  );
}
