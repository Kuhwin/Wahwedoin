"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { MessageSquare, Clock, User, Send, Trash2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { PRIORITY_CONFIG, type Task, type TaskComment } from "@/lib/types";
import { formatRelativeTime } from "@/lib/utils";

interface TaskDetailModalProps {
  task: Task | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (taskId: string, updates: Partial<Task>) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
}

export default function TaskDetailModal({ task, open, onClose, onUpdate, onDelete }: TaskDetailModalProps) {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const supabase = createClient();

  useEffect(() => {
    if (!task) return;
    setEditTitle(task.title);
    setEditDesc(task.description || "");

    async function loadComments() {
      const { data } = await supabase
        .from("task_comments")
        .select("*")
        .eq("task_id", task!.id)
        .order("created_at", { ascending: true });
      if (data) setComments(data);
    }
    void loadComments();
  }, [task, supabase]);

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim() || !task) return;

    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("task_comments")
      .insert({
        task_id: task.id,
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

  async function handleSaveEdit() {
    if (!task) return;
    await onUpdate(task.id, {
      title: editTitle,
      description: editDesc || null,
    });
    setEditing(false);
  }

  if (!task) return null;

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
              <Button size="sm" onClick={handleSaveEdit}>Save</Button>
              <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div>
            <h2
              className="text-lg font-semibold text-slate-900 cursor-pointer hover:text-indigo-600"
              onClick={() => setEditing(true)}
            >
              {task.title}
            </h2>
            {task.description && (
              <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{task.description}</p>
            )}
          </div>
        )}

        {/* Meta */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500">Status</label>
            <select
              value={task.status}
              onChange={(e) => onUpdate(task.id, { status: e.target.value as Task["status"] })}
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
              onChange={(e) => onUpdate(task.id, { priority: e.target.value as Task["priority"] })}
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
              onChange={(e) => onUpdate(task.id, { due_date: e.target.value || null })}
              className="block w-full text-sm bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500">Created</label>
            <p className="text-sm text-slate-600 flex items-center gap-1 pt-1.5">
              <Clock size={12} />
              {formatRelativeTime(task.created_at)}
            </p>
          </div>
        </div>

        {/* Delete */}
        <div className="pt-2 border-t border-slate-200">
          <Button
            variant="danger"
            size="sm"
            onClick={() => { onDelete(task.id); onClose(); }}
          >
            <Trash2 size={14} />
            Delete Task
          </Button>
        </div>

        {/* Comments */}
        <div className="border-t border-slate-200 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare size={16} className="text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-700">Comments ({comments.length})</h3>
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
                          onClick={() => handleDeleteComment(comment.id)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-300 hover:text-red-500 transition-opacity"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{comment.body}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleAddComment} className="flex gap-2">
            <input
              type="text"
              placeholder="Write a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="flex-1 text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <Button type="submit" size="sm" disabled={!newComment.trim()}>
              <Send size={14} />
            </Button>
          </form>
        </div>
      </div>
    </Modal>
  );
}
