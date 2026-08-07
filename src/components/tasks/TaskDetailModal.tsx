"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import MultiProjectSelector from "@/components/MultiProjectSelector";
import {
  MessageSquare,
  Check,
  Plus,
  Trash2,
  X,
  Tag,
  ListTodo,
  History,
  User,
  Calendar,
  Clock,
  Paperclip,
  Upload,
  File,
  ChevronRight,
  Repeat,
  Reply,
  Video,
  Users,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import {
  type Task,
  type TaskComment,
  type Tag as TagType,
  type Activity,
  type TeamMember,
  type TaskAttachment,
} from "@/lib/types";
import { formatRelativeTime, cn } from "@/lib/utils";
import { logActivity } from "@/lib/activities";
import ReactMarkdown from "react-markdown";
import CustomFieldsPanel from "@/components/CustomFieldsPanel";

function toLocalDateTimeInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface TaskDetailModalProps {
  task: Task | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (taskId: string, updates: Partial<Task>) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
  availableTags?: TagType[];
  teamMembers?: TeamMember[];
}

interface MemberProfile {
  user_id: string;
  display_name: string;
  user_email?: string;
}

export default function TaskDetailModal({
  task,
  open,
  onClose,
  onUpdate,
  onDelete,
  availableTags = [],
  teamMembers = [],
}: TaskDetailModalProps) {
  const supabase = createClient();

  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<TaskComment | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [descPreview, setDescPreview] = useState(false);
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [newSubtask, setNewSubtask] = useState("");
  const subtaskInputRef = useRef<HTMLInputElement>(null);
  const [taskTags, setTaskTags] = useState<TagType[]>([]);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [creatingTag, setCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#6366f1");
  const [isPersonalTag, setIsPersonalTag] = useState(false);
  const tagDropdownRef = useRef<HTMLDivElement>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityUserNames, setActivityUserNames] = useState<Record<string, string>>({});
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [allActivities, setAllActivities] = useState<Activity[]>([]);
  const [allActivitiesLoading, setAllActivitiesLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [memberProfiles, setMemberProfiles] = useState<MemberProfile[]>([]);
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const assigneeDropdownRef = useRef<HTMLDivElement>(null);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [taskAssignees, setTaskAssignees] = useState<string[]>([]);
  const [taskFollowers, setTaskFollowers] = useState<string[]>([]);
  const [showFollowerDropdown, setShowFollowerDropdown] = useState(false);
  const [parentTask, setParentTask] = useState<Task | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const commentInputRef = useRef<HTMLInputElement>(null);

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

      const [commentsRes, subtasksRes, tagLinksRes, activityRes, attachRes, assigneeRes, followerRes] = await Promise.all([
        supabase
          .from("task_comments")
          .select("id, task_id, user_id, body, parent_id, created_at")
          .eq("task_id", task!.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("tasks")
          .select("id, project_id, title, description, status, priority, position, created_at")
          .eq("parent_id", task!.id)
          .order("position", { ascending: true }),
        supabase
          .from("task_tags")
          .select("tag_id")
          .eq("task_id", task!.id),
        supabase
          .from("activities")
          .select("id, user_id, action, detail, created_at")
          .eq("task_id", task!.id)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("task_attachments")
          .select("id, task_id, file_name, file_url, file_size, uploaded_by, created_at")
          .eq("task_id", task!.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("task_assignees")
          .select("user_id")
          .eq("task_id", task!.id),
        supabase
          .from("task_followers")
          .select("user_id")
          .eq("task_id", task!.id),
      ]);

      if (commentsRes.data) setComments(commentsRes.data);
      if (subtasksRes.data) setSubtasks(subtasksRes.data);
      if (activityRes.data) {
        setActivities(activityRes.data);
        const userIds = [...new Set(activityRes.data.map((a: Activity) => a.user_id).filter(Boolean))];
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from("user_profiles")
            .select("user_id, display_name")
            .in("user_id", userIds);
          if (profiles) {
            const map: Record<string, string> = {};
            profiles.forEach((p: { user_id: string; display_name: string }) => { map[p.user_id] = p.display_name; });
            setActivityUserNames(map);
          }
        }
      }
      if (attachRes.data) setAttachments(attachRes.data as TaskAttachment[]);
      if (assigneeRes.data) setTaskAssignees(assigneeRes.data.map((a: { user_id: string }) => a.user_id));
      if (followerRes.data) setTaskFollowers(followerRes.data.map((f: { user_id: string }) => f.user_id));

      if (tagLinksRes.data && tagLinksRes.data.length > 0) {
        const tagIds = tagLinksRes.data.map((l: { tag_id: string }) => l.tag_id);
        const { data: tagsData } = await supabase
          .from("tags")
          .select("id, team_id, name, color, created_at")
          .in("id", tagIds);
        if (tagsData) setTaskTags(tagsData);
      } else {
        setTaskTags([]);
      }

      if (task!.parent_id) {
        const { data: parentData } = await supabase
          .from("tasks")
          .select("id, title")
          .eq("id", task!.parent_id)
          .single();
        setParentTask(parentData as Task | null);
      } else {
        setParentTask(null);
      }
    }

    void loadAll();
  }, [task, supabase]);

  // Load member profiles
  useEffect(() => {
    if (teamMembers.length === 0) return;
    async function loadProfiles() {
      const userIds = teamMembers.map((m) => m.user_id);
      const { data } = await supabase
        .from("user_profiles")
        .select("user_id, display_name")
        .in("user_id", userIds);
      if (data) {
        const profiles = userIds.map((uid) => {
          const profile = data.find((p: { user_id: string; display_name: string }) => p.user_id === uid);
          const member = teamMembers.find((m) => m.user_id === uid);
          return {
            user_id: uid,
            display_name: profile?.display_name || "",
            user_email: member?.user_email,
          };
        });
        setMemberProfiles(profiles);
      }
    }
    void loadProfiles();
  }, [teamMembers, supabase]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target as Node)) {
        setShowTagDropdown(false);
      }
      if (assigneeDropdownRef.current && !assigneeDropdownRef.current.contains(e.target as Node)) {
        setShowAssigneeDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  useEffect(() => {
    function handleClickOutside() {
      if (showFollowerDropdown) setShowFollowerDropdown(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showFollowerDropdown]);

  if (!task) return null;

  function getMemberName(userId: string) {
    const profile = memberProfiles.find((p) => p.user_id === userId);
    if (profile?.display_name) return profile.display_name;
    if (profile?.user_email) return profile.user_email.split("@")[0];
    return userId.slice(0, 8);
  }

  async function loadAllActivities() {
    setAllActivitiesLoading(true);
    const { data } = await supabase
      .from("activities")
      .select("id, user_id, action, detail, created_at")
      .eq("task_id", task!.id)
      .order("created_at", { ascending: false });
    if (data) {
      setAllActivities(data);
      const userIds = [...new Set(data.map((a: Activity) => a.user_id).filter(Boolean))];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("user_profiles")
          .select("user_id, display_name")
          .in("user_id", userIds);
        if (profiles) {
          const map: Record<string, string> = {};
          profiles.forEach((p: { user_id: string; display_name: string }) => { map[p.user_id] = p.display_name; });
          setActivityUserNames((prev) => ({ ...prev, ...map }));
        }
      }
    }
    setAllActivitiesLoading(false);
    setShowAllActivities(true);
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const body = newComment.trim();
    const parentId = replyTo?.id || null;

    // Optimistic insert — show the comment immediately with a temp id
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: TaskComment = {
      id: tempId,
      task_id: task!.id,
      user_id: user.id,
      body,
      parent_id: parentId,
      created_at: new Date().toISOString(),
    };
    const previousComments = comments;
    setComments([...comments, optimistic]);
    setNewComment("");
    setMentionOpen(false);
    setReplyTo(null);

    const { data, error } = await supabase
      .from("task_comments")
      .insert({
        task_id: task!.id,
        user_id: user.id,
        body,
        parent_id: parentId,
      })
      .select()
      .single();

    if (error || !data) {
      setComments(previousComments);
      return;
    }

    // Replace the optimistic temp with the real DB row
    setComments((prev) => prev.map((c) => (c.id === tempId ? data : c)));

    logActivity({ project_id: task!.project_id, task_id: task!.id, user_id: user.id, action: "commented on", detail: task!.title });

    const taskLink = task!.project_id ? `/projects/${task!.project_id}` : "/my-tasks";

    // Notify @mentioned users (deduped by id)
    const mentionedUserIds = new Set<string>();
    const mentionRegex = /@(\S+)/g;
    let match;
    while ((match = mentionRegex.exec(body)) !== null) {
      const mentionedName = match[1].toLowerCase();
      const mentioned = memberProfiles.find(
        (mp) => (mp.display_name || "").toLowerCase().includes(mentionedName) || (mp.user_email || "").toLowerCase().startsWith(mentionedName)
      );
      if (mentioned && mentioned.user_id !== user.id && !mentionedUserIds.has(mentioned.user_id)) {
        mentionedUserIds.add(mentioned.user_id);
        const title = `You were mentioned in a comment on "${task!.title}"`;
        const mentionBody = `${getMemberName(user.id)}: ${body}`;
        await supabase.from("notifications").insert({ user_id: mentioned.user_id, type: "comment", title, body: mentionBody, link: taskLink });
        void fetch("/api/notifications/send-assignment", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: mentioned.user_id, title, body: mentionBody, link: taskLink }),
        });
      }
    }

    // Notify followers (excluding the comment author and users already mentioned)
    if (taskFollowers.length > 0) {
      const title = `New comment on "${task!.title}"`;
      const commentBody = `${getMemberName(user.id)}: ${body}`;
      for (const fid of taskFollowers) {
        if (fid === user.id || mentionedUserIds.has(fid)) continue;
        await supabase.from("notifications").insert({ user_id: fid, type: "comment", title, body: commentBody, link: taskLink });
        void fetch("/api/notifications/send-assignment", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: fid, title, body: commentBody, link: taskLink }),
        });
      }
    }
  }

  async function handleDeleteComment(commentId: string) {
    const { error } = await supabase.from("task_comments").delete().eq("id", commentId);
    if (!error) {
      setComments(comments.filter((c) => c.id !== commentId));
    }
  }

  async function handleUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !task) return;
    setUploading(true);

    const ext = file.name.split(".").pop() || "";
    const filePath = `${task.id}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("task-attachments")
      .upload(filePath, file, { contentType: file.type });

    if (uploadError) {
      setUploading(false);
      return;
    }

    const { data, error } = await supabase
      .from("task_attachments")
      .insert({
        task_id: task.id,
        user_id: currentUserId,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        mime_type: file.type,
      })
      .select()
      .single();

    if (data && !error) {
      setAttachments([data, ...attachments]);
      if (currentUserId) {
        logActivity({ project_id: task.project_id, task_id: task.id, user_id: currentUserId, action: "attached file to", detail: task.title });
      }
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleDeleteAttachment(attachment: TaskAttachment) {
    await supabase.storage.from("task-attachments").remove([attachment.file_path]);
    const { error } = await supabase.from("task_attachments").delete().eq("id", attachment.id);
    if (!error) {
      setAttachments(attachments.filter((a) => a.id !== attachment.id));
    }
  }

  async function handleDownloadAttachment(attachment: TaskAttachment) {
    const { data } = await supabase.storage
      .from("task-attachments")
      .createSignedUrl(attachment.file_path, 60);
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank");
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function handleSaveEdit() {
    await onUpdate(task!.id, {
      title: editTitle,
      description: editDesc || null,
    });
    setEditing(false);
  }

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
        section_id: task!.section_id,
        created_by: currentUserId,
      })
      .select()
      .single();

    if (data && !error) {
      setSubtasks([...subtasks, data]);
      setNewSubtask("");
      subtaskInputRef.current?.focus();
      if (currentUserId) {
        logActivity({ project_id: task!.project_id, task_id: task!.id, user_id: currentUserId, action: "added subtask to", detail: task!.title });
      }
    }
  }

  async function handleDeleteSubtask(subtaskId: string) {
    const { error } = await supabase.from("tasks").delete().eq("id", subtaskId);
    if (!error) {
      setSubtasks(subtasks.filter((s) => s.id !== subtaskId));
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

    async function buildTagData(): Promise<{ team_id?: string; user_id?: string; name: string; color: string } | null> {
      if (isPersonalTag) {
        return { name: newTagName.trim(), color: newTagColor, user_id: user.id };
      }
      const { data: teamMember } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();
      if (!teamMember) return null;
      return { name: newTagName.trim(), color: newTagColor, team_id: teamMember.team_id };
    }

    const tagData = await buildTagData();
    if (!tagData) return;

    const { data: tag, error } = await supabase
      .from("tags")
      .insert(tagData)
      .select()
      .single();

    if (tag && !error) {
      await supabase.from("task_tags").insert({ task_id: task!.id, tag_id: tag.id });
      setTaskTags([...taskTags, tag]);
      setNewTagName("");
      setCreatingTag(false);
      setIsPersonalTag(false);
    }
  }

  async function handleAssigneeToggle(userId: string) {
    const isAssigned = taskAssignees.includes(userId);
    if (isAssigned) {
      await supabase.from("task_assignees").delete().eq("task_id", task!.id).eq("user_id", userId);
      setTaskAssignees(taskAssignees.filter((id) => id !== userId));
    } else {
      await supabase.from("task_assignees").insert({ task_id: task!.id, user_id: userId });
      setTaskAssignees([...taskAssignees, userId]);
      if (userId !== currentUserId && task) {
        const title = `You were assigned to "${task.title}"`;
        const body = `Assigned by ${getMemberName(currentUserId ?? "")}`;
        const link = `/projects/${task.project_id}`;
        await supabase.from("notifications").insert({ user_id: userId, title, body, type: "task", link });
        void fetch("/api/notifications/send-assignment", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, title, body, link }),
        });
      }
    }
  }

  async function handleAssignMyself() {
    if (!currentUserId) return;
    if (taskAssignees.includes(currentUserId)) return;
    await supabase.from("task_assignees").insert({ task_id: task!.id, user_id: currentUserId });
    setTaskAssignees([...taskAssignees, currentUserId]);
  }

  async function handleFollowerToggle(userId: string) {
    const isFollowing = taskFollowers.includes(userId);
    if (isFollowing) {
      await supabase.from("task_followers").delete().eq("task_id", task!.id).eq("user_id", userId);
      setTaskFollowers(taskFollowers.filter((id) => id !== userId));
    } else {
      await supabase.from("task_followers").insert({ task_id: task!.id, user_id: userId });
      setTaskFollowers([...taskFollowers, userId]);
    }
  }

  async function handleFollowMyself() {
    if (!currentUserId) return;
    if (taskFollowers.includes(currentUserId)) return;
    await supabase.from("task_followers").insert({ task_id: task!.id, user_id: currentUserId });
    setTaskFollowers([...taskFollowers, currentUserId]);
  }

  function getFollowerName(userId: string) {
    const profile = memberProfiles.find((p) => p.user_id === userId);
    if (profile?.display_name) return profile.display_name;
    if (profile?.user_email) return profile.user_email.split("@")[0];
    return userId.slice(0, 8);
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
              className="w-full text-lg font-semibold text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDescPreview(false)}
                  className={cn("text-xs font-medium px-2 py-0.5 rounded", !descPreview ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300")}
                >
                  Edit
                </button>
                <button
                  onClick={() => setDescPreview(true)}
                  className={cn("text-xs font-medium px-2 py-0.5 rounded", descPreview ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300")}
                >
                  Preview
                </button>
              </div>
              {descPreview ? (
                <div className="text-sm text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 min-h-[68px] prose prose-sm max-w-none">
                  {editDesc ? <ReactMarkdown>{editDesc}</ReactMarkdown> : <span className="text-slate-400 dark:text-slate-500 italic">Nothing to preview</span>}
                </div>
              ) : (
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Add a description... (Markdown supported)"
                  className="w-full text-sm text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-accent/50"
                  rows={3}
                />
              )}
            </div>
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
            {parentTask && (
              <div className="text-xs text-slate-400 dark:text-slate-500 mb-1 flex items-center gap-1">
                <span className="truncate max-w-[250px] opacity-70">{parentTask.title}</span>
                <span>/</span>
              </div>
            )}
            <h2
              className="text-lg font-semibold text-slate-900 dark:text-slate-100 cursor-pointer hover:text-accent transition-colors"
              onClick={() => setEditing(true)}
            >
              {task.title}
            </h2>
            {task.description ? (
              <div
                className="text-sm text-slate-600 dark:text-slate-400 mt-2 cursor-pointer hover:text-slate-800 transition-colors prose prose-sm max-w-none"
                onClick={() => setEditing(true)}
              >
                <ReactMarkdown>{task.description}</ReactMarkdown>
              </div>
            ) : (
              <p
                className="text-sm text-slate-400 dark:text-slate-500 italic mt-2 cursor-pointer hover:text-slate-600 transition-colors"
                onClick={() => setEditing(true)}
              >
                Click to add a description...
              </p>
            )}
          </div>
        )}

        <div className="text-[11px] text-slate-400 dark:text-slate-500 -mt-1">
          Updated {new Date(task.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
        </div>

        {/* Meta row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Status */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Check size={12} /> Status
            </label>
            <select
              value={task.status}
              onChange={(e) =>
                onUpdate(task.id, { status: e.target.value as Task["status"] })
              }
              className="block w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent/50"
            >
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
            </select>
          </div>

          {/* Priority */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Priority</label>
            <select
              value={task.priority}
              onChange={(e) =>
                onUpdate(task.id, { priority: e.target.value as Task["priority"] })
              }
              className="block w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent/50"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          {/* Due Date */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Calendar size={12} /> Due Date
            </label>
            <input
              type="date"
              value={task.due_date || ""}
              onChange={(e) =>
                onUpdate(task.id, { due_date: e.target.value || null })
              }
              className="block w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
          </div>

          {/* Start Date */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Calendar size={12} /> Start Date
            </label>
            <input
              type="date"
              value={task.start_date || ""}
              onChange={(e) =>
                onUpdate(task.id, { start_date: e.target.value || null } as Partial<Task>)
              }
              className="block w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
          </div>

          {/* Reminder */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Clock size={12} /> Reminder
            </label>
            <input
              type="datetime-local"
              value={toLocalDateTimeInput(task.reminder_at)}
              onChange={(e) =>
                onUpdate(task.id, { reminder_at: e.target.value ? new Date(e.target.value).toISOString() : null } as Partial<Task>)
              }
              className="block w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
          </div>

          {/* Recurrence */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Repeat size={12} /> Repeat
            </label>
            <select
              value={task.recurrence || ""}
              onChange={(e) =>
                onUpdate(task.id, { recurrence: e.target.value || null } as Partial<Task>)
              }
              className="block w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent/50"
            >
              <option value="">Does not repeat</option>
              <option value="daily">Every day</option>
              <option value="weekly">Every week</option>
              <option value="biweekly">Every 2 weeks</option>
              <option value="monthly">Every month</option>
              <option value="yearly">Every year</option>
            </select>
          </div>
          {(task.recurrence && task.recurrence !== "") && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Repeat Until</label>
              <input
                type="date"
                value={task.recurrence_end || ""}
                onChange={(e) =>
                  onUpdate(task.id, { recurrence_end: e.target.value || null } as Partial<Task>)
                }
                className="block w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
            </div>
          )}

          {/* Milestone */}
          <div className="col-span-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={task.is_milestone || false}
                onChange={(e) =>
                  onUpdate(task.id, { is_milestone: e.target.checked } as Partial<Task>)
                }
                className="rounded border-slate-300"
              />
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">◆ Milestone</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">— mark as key deliverable</span>
            </label>
          </div>

          {/* Assignees */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <User size={12} /> Assignees
            </label>
            <div className="relative" ref={assigneeDropdownRef}>
              <button
                onClick={() => setShowAssigneeDropdown(!showAssigneeDropdown)}
                className="w-full flex items-center gap-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-1 focus:ring-accent/50"
              >
                {taskAssignees.length > 0 ? (
                  <div className="flex items-center -space-x-1.5">
                    {taskAssignees.slice(0, 3).map((uid) => (
                      <Avatar key={uid} name={getMemberName(uid)} email={uid} size="sm" className="ring-2 ring-slate-50 dark:ring-slate-900" />
                    ))}
                    {taskAssignees.length > 3 && (
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 ml-2">+{taskAssignees.length - 3}</span>
                    )}
                  </div>
                ) : (
                  <span className="text-slate-400 dark:text-slate-500 italic">Unassigned</span>
                )}
              </button>

              {showAssigneeDropdown && (
                <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg py-1 max-h-64 overflow-y-auto">
                  {currentUserId && (
                    <button
                      onClick={() => void handleAssignMyself()}
                      disabled={taskAssignees.includes(currentUserId)}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 text-sm text-left border-b border-slate-100 dark:border-slate-700/50 transition-colors",
                          taskAssignees.includes(currentUserId)
                            ? "text-slate-400 dark:text-slate-500 cursor-not-allowed"
                            : "text-indigo-600 hover:bg-accent/10 font-medium"
                      )}
                    >
                      <User size={14} />
                      {taskAssignees.includes(currentUserId) ? "Already assigned" : "Assign myself"}
                    </button>
                  )}
                  {memberProfiles.map((member) => {
                    const isAssigned = taskAssignees.includes(member.user_id);
                    return (
                      <button
                        key={member.user_id}
                        onClick={() => void handleAssigneeToggle(member.user_id)}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors",
                          isAssigned && "bg-indigo-50 dark:bg-indigo-900/20"
                        )}
                      >
                        <Avatar
                          name={member.display_name}
                          email={member.user_email || member.user_id}
                          size="sm"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-700 dark:text-slate-300 truncate">
                            {member.display_name || member.user_email || "Unknown"}
                          </p>
                        </div>
                        {isAssigned && (
                          <Check size={14} className="text-indigo-600 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Followers */}
          <div className="col-span-2 space-y-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Users size={12} /> Followers
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {taskFollowers.length > 0 && (
                <div className="flex items-center -space-x-1.5">
                  {taskFollowers.slice(0, 5).map((uid) => (
                    <Avatar key={uid} name={getFollowerName(uid)} email={uid} size="sm" className="ring-2 ring-slate-50 dark:ring-slate-900" />
                  ))}
                </div>
              )}
              {currentUserId && (
                <button
                  onClick={() => (taskFollowers.includes(currentUserId) ? void handleFollowerToggle(currentUserId) : void handleFollowMyself())}
                  className={cn(
                    "text-xs font-medium rounded-full border px-2.5 py-1 transition-colors",
                    taskFollowers.includes(currentUserId)
                      ? "text-indigo-600 dark:text-indigo-400 border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20"
                      : "text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
                  )}
                >
                  {taskFollowers.includes(currentUserId) ? "Following" : "Follow"}
                </button>
              )}
              <button
                onClick={() => setShowFollowerDropdown(!showFollowerDropdown)}
                className="text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded-full px-2.5 py-1 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1"
              >
                <Plus size={12} /> Add
              </button>
              {showFollowerDropdown && (
                <div className="relative">
                  <div className="absolute z-50 mt-1 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg py-1 max-h-64 overflow-y-auto">
                    {memberProfiles
                      .filter((m) => !taskFollowers.includes(m.user_id))
                      .map((member) => (
                        <button
                          key={member.user_id}
                          onClick={() => void handleFollowerToggle(member.user_id)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                          <Avatar name={member.display_name} email={member.user_email || member.user_id} size="sm" />
                          <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                            {member.display_name || member.user_email || "Unknown"}
                          </span>
                        </button>
                      ))}
                    {memberProfiles.filter((m) => !taskFollowers.includes(m.user_id)).length === 0 && (
                      <p className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500 italic">Everyone&apos;s following</p>
                    )}
                  </div>
                </div>
              )}
            </div>
            {taskFollowers.length > 5 && (
              <p className="text-[10px] text-slate-400 dark:text-slate-500">
                +{taskFollowers.length - 5} more follower{taskFollowers.length - 5 === 1 ? "" : "s"}
              </p>
            )}
          </div>
        </div>

        {/* Linked Event */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Calendar size={12} /> Linked Event
          </label>
          <EventLinker taskId={task.id} eventId={task.event_id || null} onUpdate={onUpdate} supabase={supabase} />
        </div>

        {/* Multi-homing Projects */}
        <div className="space-y-1">
          <MultiProjectSelector
            taskId={task.id}
            primaryProjectId={task.project_id}
            currentProjects={task.projects || []}
            onUpdate={onUpdate}
          />
        </div>

        {/* Subtasks */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListTodo size={16} className="text-slate-400 dark:text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Subtasks</h3>
              {totalSubtasks > 0 && (
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {completedSubtasks}/{totalSubtasks}
                </span>
              )}
            </div>
          </div>

          {totalSubtasks > 0 && (
            <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
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
                className="flex items-center gap-2 group px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <button
                  onClick={() => handleToggleSubtask(subtask)}
                  className={cn(
                    "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                    subtask.status === "done"
                      ? "bg-indigo-500 border-indigo-500"
                      : "border-slate-300 dark:border-slate-600 hover:border-accent/50"
                  )}
                >
                  {subtask.status === "done" && <Check size={10} className="text-white" />}
                </button>
                <span
                  className={cn(
                    "text-sm flex-1",
                    subtask.status === "done"
                      ? "line-through text-slate-400 dark:text-slate-500"
                      : "text-slate-700 dark:text-slate-300"
                  )}
                >
                  {subtask.title}
                </span>
                <button
                  onClick={() => void handleDeleteSubtask(subtask.id)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-300 hover:text-red-500 transition-opacity shrink-0"
                >
                  <Trash2 size={10} />
                </button>
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
              className="flex-1 text-sm bg-transparent border border-dashed border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-indigo-400 placeholder:text-slate-400 dark:placeholder:text-slate-500"
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

        {/* Attachments */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Paperclip size={16} className="text-slate-400 dark:text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Attachments</h3>
              {attachments.length > 0 && (
                <span className="text-xs text-slate-400 dark:text-slate-500">{attachments.length}</span>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => void handleUploadFile(e)}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
               className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-indigo-600 hover:bg-accent/10 transition-colors disabled:opacity-50"
            >
              <Upload size={12} />
              {uploading ? "Uploading..." : "Upload"}
            </button>
          </div>

          {attachments.length > 0 && (
            <div className="space-y-1">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group"
                >
                  <File size={14} className="text-slate-400 dark:text-slate-500 shrink-0" />
                  <button
                    onClick={() => void handleDownloadAttachment(att)}
                    className="flex-1 text-sm text-slate-700 dark:text-slate-300 hover:text-accent truncate text-left transition-colors"
                  >
                    {att.file_name}
                  </button>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
                    {formatFileSize(att.file_size)}
                  </span>
                  <button
                    onClick={() => void handleDeleteAttachment(att)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-300 dark:text-slate-600 hover:text-red-500 transition-opacity shrink-0"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
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
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-accent/50 hover:text-accent transition-colors"
              >
                <Plus size={12} />
                Add tag
              </button>

              {showTagDropdown && (
                <div className="absolute z-50 mt-1 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-2 space-y-1">
                  {creatingTag ? (
                    <div className="space-y-2 p-1">
                      <input
                        autoFocus
                        type="text"
                        placeholder="Tag name"
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent/50"
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
                        <label className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isPersonalTag}
                            onChange={(e) => setIsPersonalTag(e.target.checked)}
                            className="rounded border-slate-300"
                          />
                          Personal
                        </label>
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
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                          >
                            <span
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: tag.color }}
                            />
                            {tag.name}
                            {"user_id" in tag && (tag as { user_id?: string }).user_id && (
                              <span className="text-[9px] text-slate-400 dark:text-slate-500 ml-auto">Mine</span>
                            )}
                          </button>
                        ))}
                      {availableTags.filter((t) => !taskTags.some((tt) => tt.id === t.id))
                        .length === 0 && (
                        <p className="text-xs text-slate-400 dark:text-slate-500 px-2 py-1.5">
                          No more available tags
                        </p>
                      )}
                      <button
                        onClick={() => setCreatingTag(true)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-indigo-600 hover:bg-accent/10 transition-colors text-left font-medium"
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

        {/* Custom Fields */}
        {task && <CustomFieldsPanel projectId={task.project_id} taskId={task.id} />}

        {/* Activity Log */}
        {activities.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <History size={16} className="text-slate-400 dark:text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Activity</h3>
            </div>
            <div className="space-y-0 relative">
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-200 dark:bg-slate-700" />
              {(showAllActivities ? allActivities : activities).map((activity) => {
                const isOwn = activity.user_id === currentUserId;
                const userName = isOwn ? "You" : (activityUserNames[activity.user_id] || "Someone");
                return (
                  <div key={activity.id} className="flex items-start gap-2.5 py-2 relative">
                    <div className="w-[15px] h-[15px] rounded-full bg-slate-200 dark:bg-slate-700 border-2 border-white dark:border-slate-900 shrink-0 mt-0.5 z-10" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        <span className="font-medium text-slate-800 dark:text-slate-200">{userName}</span>{" "}
                        {activity.action}
                        {activity.detail && (
                          <span className="text-slate-500 dark:text-slate-400"> {activity.detail}</span>
                        )}
                      </p>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        {formatRelativeTime(activity.created_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {!showAllActivities && (
              <button
                onClick={() => void loadAllActivities()}
                disabled={allActivitiesLoading}
                className="text-xs font-medium text-accent hover:text-accent/80 dark:hover:text-indigo-300 transition-colors flex items-center gap-1"
              >
                {allActivitiesLoading ? "Loading..." : "Show all activity"}
                <ChevronRight size={12} />
              </button>
            )}
            {showAllActivities && allActivities.length > 5 && (
              <button
                onClick={() => setShowAllActivities(false)}
                className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
              >
                Show less
              </button>
            )}
          </div>
        )}

        {/* Comments */}
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare size={16} className="text-slate-400 dark:text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Comments ({comments.length})
            </h3>
          </div>

          {comments.length > 0 && (() => {
            const topLevel = comments.filter((c) => !c.parent_id);
            const repliesMap = new Map<string, TaskComment[]>();
            comments.forEach((c) => {
              if (c.parent_id) {
                const existing = repliesMap.get(c.parent_id) || [];
                existing.push(c);
                repliesMap.set(c.parent_id, existing);
              }
            });

            function renderComment(comment: TaskComment, depth: number = 0) {
              const replies = repliesMap.get(comment.id) || [];
              const isOwn = comment.user_id === currentUserId;
              return (
                <div key={comment.id} className={cn("flex gap-3 group", depth > 0 && "ml-8 mt-2")}>
                  <Avatar name={comment.user_name} email={comment.user_email || comment.user_id} size={depth > 0 ? "xs" : "sm"} />
                  <div className="flex-1">
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          {isOwn ? "You" : (comment.user_name || comment.user_email || "Unknown")}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">
                            {formatRelativeTime(comment.created_at)}
                          </span>
                          <button
                            onClick={() => setReplyTo(comment)}
                            className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-300 dark:text-slate-600 hover:text-indigo-500 transition-opacity"
                            title="Reply"
                          >
                            <Reply size={10} />
                          </button>
                          {(isOwn || currentUserId === comment.user_id) && (
                            <button
                              onClick={() => void handleDeleteComment(comment.id)}
                              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-300 dark:text-slate-600 hover:text-red-500 transition-opacity"
                            >
                              <Trash2 size={10} />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 whitespace-pre-wrap">
                        {comment.body}
                      </p>
                    </div>
                    {replies.map((reply) => renderComment(reply, depth + 1))}
                  </div>
                </div>
              );
            }

            return (
              <div className="space-y-3 mb-4">
                {topLevel.map((comment) => renderComment(comment))}
              </div>
            );
          })()}

          <form onSubmit={(e) => void handleAddComment(e)} className="flex gap-2 relative">
            {replyTo && (
              <div className="w-full flex items-center gap-2 mb-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg text-xs text-indigo-700 dark:text-indigo-300">
                <Reply size={12} />
                <span className="flex-1 truncate">Replying to <strong>{replyTo.user_name || replyTo.user_email || "someone"}</strong>: &ldquo;{replyTo.body}&rdquo;</span>
                <button type="button" onClick={() => setReplyTo(null)} className="text-indigo-400 hover:text-accent dark:hover:text-indigo-200">
                  <X size={12} />
                </button>
              </div>
            )}
            <div className="flex-1 relative">
              <input
                ref={commentInputRef}
                type="text"
                placeholder="Write a comment... (type @ to mention)"
                value={newComment}
                onChange={(e) => {
                  const val = e.target.value;
                  setNewComment(val);
                  const lastAt = val.lastIndexOf("@");
                  if (lastAt >= 0 && (lastAt === 0 || val[lastAt - 1] === " ")) {
                    const filter = val.slice(lastAt + 1);
                    if (!filter.includes(" ")) {
                      setMentionOpen(true);
                      setMentionFilter(filter.toLowerCase());
                    } else {
                      setMentionOpen(false);
                    }
                  } else {
                    setMentionOpen(false);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setMentionOpen(false);
                }}
                className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
              {mentionOpen && memberProfiles.length > 0 && (
                <div className="absolute z-50 bottom-full mb-1 left-0 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg py-1 max-h-48 overflow-y-auto">
                  {memberProfiles
                    .filter((mp) => {
                      const name = (mp.display_name || "").toLowerCase();
                      const email = (mp.user_email || "").toLowerCase();
                      return name.includes(mentionFilter) || email.includes(mentionFilter);
                    })
                    .slice(0, 8)
                    .map((mp) => (
                      <button
                        key={mp.user_id}
                        type="button"
                        onClick={() => {
                          const lastAt = newComment.lastIndexOf("@");
                          const before = newComment.slice(0, lastAt);
                          const name = mp.display_name || mp.user_email || "";
                          setNewComment(`${before}@${name} `);
                          setMentionOpen(false);
                          commentInputRef.current?.focus();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Avatar name={mp.display_name} email={mp.user_id} size="xs" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{mp.display_name || "Unknown"}</p>
                          {mp.user_email && <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{mp.user_email}</p>}
                        </div>
                      </button>
                    ))}
                  {memberProfiles.filter((mp) => {
                    const name = (mp.display_name || "").toLowerCase();
                    const email = (mp.user_email || "").toLowerCase();
                    return name.includes(mentionFilter) || email.includes(mentionFilter);
                  }).length === 0 && (
                    <p className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">No members found</p>
                  )}
                </div>
              )}
            </div>
            <Button type="submit" size="sm" disabled={!newComment.trim()}>
              <Plus size={14} />
            </Button>
          </form>
        </div>

        {/* Delete */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
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

function EventLinker({
  taskId,
  eventId,
  onUpdate,
  supabase,
}: {
  taskId: string;
  eventId: string | null;
  onUpdate: (taskId: string, updates: Partial<Task>) => Promise<void>;
  supabase: ReturnType<typeof createClient>;
}) {
  const [events, setEvents] = useState<{ id: string; title: string; start_date: string; color: string | null }[]>([]);
  const [linkedEvent, setLinkedEvent] = useState<{ id: string; title: string; start_date: string; color: string | null; meet_link: string | null; attendees: { email: string; name: string }[] | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (eventId) {
      setLoading(true);
      supabase
        .from("events")
        .select("id, title, start_date, color, meet_link, attendees")
        .eq("id", eventId)
        .single()
        .then(({ data }: { data: { id: string; title: string; start_date: string; color: string | null; meet_link: string | null; attendees: { email: string; name: string }[] | null } | null }) => {
          setLinkedEvent(data);
          setLoading(false);
        });
    } else {
      setLinkedEvent(null);
    }
  }, [eventId, supabase]);

  async function loadEvents() {
    const { data } = await supabase
      .from("events")
      .select("id, title, start_date, color")
      .order("start_date", { ascending: true });
    if (data) setEvents(data);
  }

  function handleOpen() {
    setOpen(true);
    void loadEvents();
  }

  async function handleLink(eventId: string | null) {
    await onUpdate(taskId, { event_id: eventId } as Partial<Task>);
    setOpen(false);
  }

  if (loading) {
    return <div className="text-xs text-slate-400 dark:text-slate-500">Loading...</div>;
  }

  if (linkedEvent && !open) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 flex-1 min-w-0">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: linkedEvent.color || "#6366f1" }} />
            <span className="truncate text-slate-700 dark:text-slate-300">{linkedEvent.title}</span>
            <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
              {new Date(linkedEvent.start_date).toLocaleDateString("en-GB", { month: "short", day: "numeric" })}
            </span>
          </div>
          <button
            onClick={() => void handleLink(null)}
            className="p-1 text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 transition-colors"
            title="Unlink event"
          >
            <X size={14} />
          </button>
        </div>
        {(linkedEvent.meet_link || (linkedEvent.attendees && linkedEvent.attendees.length > 0)) && (
          <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            {linkedEvent.meet_link && (
              <a
                href={linkedEvent.meet_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
              >
                <Video size={10} /> Join Meeting
              </a>
            )}
            {linkedEvent.attendees && linkedEvent.attendees.length > 0 && (
              <span className="flex items-center gap-1">
                <Users size={10} />
                {linkedEvent.attendees.length} attendee{linkedEvent.attendees.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      {!open ? (
        <button
          onClick={handleOpen}
          className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-left text-slate-400 dark:text-slate-500 hover:border-accent/50 hover:text-accent dark:hover:border-accent/50 dark:hover:text-accent transition-colors"
        >
          Link to event...
        </button>
      ) : (
        <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 max-h-48 overflow-y-auto space-y-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Select event</span>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              <X size={12} />
            </button>
          </div>
          {events.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 py-2">No events found</p>
          ) : (
            events.map((evt) => (
              <button
                key={evt.id}
                onClick={() => void handleLink(evt.id)}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm hover:bg-white dark:hover:bg-slate-700 transition-colors",
                  eventId === evt.id && "bg-indigo-50 dark:bg-indigo-900/20"
                )}
              >
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: evt.color || "#6366f1" }} />
                <span className="truncate text-slate-700 dark:text-slate-300">{evt.title}</span>
                <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0 ml-auto">
                  {new Date(evt.start_date).toLocaleDateString("en-GB", { month: "short", day: "numeric" })}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
