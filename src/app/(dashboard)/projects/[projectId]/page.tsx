"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Plus, LayoutGrid, List, Archive, Trash2, MoreVertical, Search, X, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import KanbanBoard from "@/components/kanban/KanbanBoard";
import ListView from "@/components/kanban/ListView";
import TaskDetailModal from "@/components/tasks/TaskDetailModal";
import CustomFieldsPanel from "@/components/CustomFieldsPanel";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Avatar from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { type Project, type Task, type Section, type TeamMember, type Tag } from "@/lib/types";
import { logActivity } from "@/lib/activities";

const DEFAULT_SECTIONS = [
  { name: "To Do", color: "#64748b", position: 0 },
  { name: "In Progress", color: "#3b82f6", position: 1 },
  { name: "Done", color: "#22c55e", position: 2 },
];

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [view, setView] = useState<"board" | "list">("board");
  const [loading, setLoading] = useState(true);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<Task["priority"]>("medium");
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskSection, setNewTaskSection] = useState("");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const { addToast } = useToast();

  const selectedTaskRef = useRef(selectedTask);
  selectedTaskRef.current = selectedTask;
  const [memberProfiles, setMemberProfiles] = useState<Record<string, string>>({});
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [filterSearch, setFilterSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("position");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const supabase = createClient();
  const projectId = params.projectId as string;

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUser(user.id);

    const { data: projectData } = await supabase
      .from("projects")
      .select("id, name, team_id, status, created_at, description")
      .eq("id", projectId)
      .single();

    if (!projectData) {
      router.push("/projects");
      return;
    }
    setProject(projectData);

    const [tasksRes, sectionsRes, membersRes, tagsRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("id, project_id, title, description, status, priority, section_id, assignee_id, due_date, position, created_by, created_at, updated_at")
        .eq("project_id", projectId)
        .order("position", { ascending: true }),
      supabase
        .from("sections")
        .select("id, project_id, name, color, position")
        .eq("project_id", projectId)
        .order("position", { ascending: true }),
      projectData.team_id
        ? supabase
            .from("team_members")
            .select("id, team_id, user_id, role, joined_at")
            .eq("team_id", projectData.team_id)
        : Promise.resolve({ data: [] }),
      projectData.team_id
        ? supabase
            .from("tags")
            .select("id, team_id, name, color, created_at")
            .eq("team_id", projectData.team_id)
        : Promise.resolve({ data: [] }),
    ]);

    if (tasksRes.data) setTasks(tasksRes.data);

    if (sectionsRes.data && sectionsRes.data.length > 0) {
      setSections(sectionsRes.data);
    } else {
      const inserted = await supabase
        .from("sections")
        .insert(DEFAULT_SECTIONS.map((s) => ({ ...s, project_id: projectId })))
        .select();
      if (inserted.data) setSections(inserted.data);
    }

    if (membersRes.data) {
      setMembers(membersRes.data);
      const userIds = membersRes.data.map((m: TeamMember) => m.user_id);
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("user_profiles")
          .select("user_id, display_name")
          .in("user_id", userIds);
        if (profiles) {
          const map: Record<string, string> = {};
          profiles.forEach((p: { user_id: string; display_name: string }) => { map[p.user_id] = p.display_name; });
          setMemberProfiles(map);
        }
      }
    }

    if (tagsRes.data) setTags(tagsRes.data);

    setLoading(false);
  }, [projectId, supabase, router]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable) return;

      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setShowAddTask(true);
      }
      if (e.key === "Escape") {
        setSelectedTask(null);
        setShowAddTask(false);
      }
      const st = selectedTaskRef.current;
      if (st) {
        if (e.key === "1") void handleUpdateTask(st.id, { priority: "low" });
        if (e.key === "2") void handleUpdateTask(st.id, { priority: "medium" });
        if (e.key === "3") void handleUpdateTask(st.id, { priority: "high" });
        if (e.key === "4") void handleUpdateTask(st.id, { priority: "urgent" });
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleUpdateTask]);

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const { data: { user } } = await supabase.auth.getUser();
    const maxPos = tasks.length > 0 ? Math.max(...tasks.map((t) => t.position)) + 1 : 0;

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        project_id: projectId,
        title: newTaskTitle.trim(),
        priority: newTaskPriority,
        assignee_id: newTaskAssignee || null,
        due_date: newTaskDueDate || null,
        section_id: newTaskSection || null,
        position: maxPos,
        created_by: user?.id,
      })
      .select()
      .single();

    if (data && !error) {
      setTasks([...tasks, data]);
      setNewTaskTitle("");
      setNewTaskPriority("medium");
      setNewTaskAssignee("");
      setNewTaskDueDate("");
      setNewTaskSection("");
      setShowAddTask(false);
      if (user?.id) {
        logActivity({ project_id: projectId, user_id: user.id, action: "created task", detail: data.title });
      }
    }
  }

  async function handleUpdateTask(taskId: string, updates: Partial<Task>) {
    const task = tasks.find((t) => t.id === taskId);
    const oldSectionId = task?.section_id ?? null;
    const oldStatus = task?.status ?? "todo";
    const { error } = await supabase
      .from("tasks")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", taskId);

    if (!error) {
      setTasks(tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)));
      setSelectedTask((prev) =>
        prev && prev.id === taskId ? { ...prev, ...updates } : prev
      );
      if ("section_id" in updates && updates.section_id !== oldSectionId) {
        addToast(
          `Moved "${task?.title || "task"}"`,
          "success",
          async () => {
            await supabase.from("tasks").update({ section_id: oldSectionId, status: oldStatus, updated_at: new Date().toISOString() }).eq("id", taskId);
            setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, section_id: oldSectionId, status: oldStatus } : t)));
          },
        );
      }
      if (currentUser) {
        const taskTitle = task?.title || "task";
        if ("status" in updates) {
          const statusLabel = updates.status === "done" ? "completed" : updates.status === "in_progress" ? "started" : "reopened";
          logActivity({ project_id: projectId, user_id: currentUser, action: `${statusLabel} task`, detail: taskTitle });
        } else if ("assignee_id" in updates) {
          logActivity({ project_id: projectId, user_id: currentUser, action: "changed assignee on", detail: taskTitle });
        } else if ("priority" in updates) {
          logActivity({ project_id: projectId, user_id: currentUser, action: `set priority ${updates.priority} on`, detail: taskTitle });
        } else if ("due_date" in updates) {
          logActivity({ project_id: projectId, user_id: currentUser, action: "updated due date on", detail: taskTitle });
        } else if ("title" in updates || "description" in updates) {
          logActivity({ project_id: projectId, user_id: currentUser, action: "edited", detail: taskTitle });
        } else if ("section_id" in updates) {
          logActivity({ project_id: projectId, user_id: currentUser, action: "moved", detail: taskTitle });
        }
      }
    }
  }

  async function handleDeleteTask(taskId: string) {
    const task = tasks.find((t) => t.id === taskId);
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    if (!error) {
      setTasks(tasks.filter((t) => t.id !== taskId));
      setSelectedTask(null);
      if (currentUser) {
        logActivity({ project_id: projectId, user_id: currentUser, action: "deleted task", detail: task?.title });
      }
      addToast(
        `Deleted "${task?.title || "task"}"`,
        "success",
        async () => {
          const { data, error: restoreError } = await supabase.from("tasks").insert(task).select().single();
          if (data && !restoreError) setTasks((prev) => [...prev, data]);
        },
      );
    }
  }

  async function handleAddSection(name: string) {
    const maxPos = sections.length > 0 ? Math.max(...sections.map((s) => s.position)) + 1 : 0;

    const { data, error } = await supabase
      .from("sections")
      .insert({
        project_id: projectId,
        name,
        color: "#6366f1",
        position: maxPos,
      })
      .select()
      .single();

    if (data && !error) {
      setSections([...sections, data]);
      if (currentUser) {
        logActivity({ project_id: projectId, user_id: currentUser, action: "created section", detail: name });
      }
    }
  }

  async function handleUpdateSection(sectionId: string, updates: Partial<Section>) {
    const { error } = await supabase
      .from("sections")
      .update(updates)
      .eq("id", sectionId);

    if (!error) {
      setSections(sections.map((s) => (s.id === sectionId ? { ...s, ...updates } : s)));
      if (currentUser && updates.name) {
        logActivity({ project_id: projectId, user_id: currentUser, action: "renamed section to", detail: updates.name });
      }
    }
  }

  async function handleDeleteSection(sectionId: string) {
    const section = sections.find((s) => s.id === sectionId);
    const { error } = await supabase.from("sections").delete().eq("id", sectionId);
    if (!error) {
      setSections(sections.filter((s) => s.id !== sectionId));
      if (currentUser) {
        logActivity({ project_id: projectId, user_id: currentUser, action: "deleted section", detail: section?.name });
      }
    }
  }

  async function handleAddTaskFromBoard(updates: Partial<Task>) {
    const { data: { user } } = await supabase.auth.getUser();
    const maxPos = tasks.length > 0 ? Math.max(...tasks.map((t) => t.position)) + 1 : 0;

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        project_id: projectId,
        title: updates.title || "Untitled",
        priority: updates.priority || "medium",
        assignee_id: updates.assignee_id || null,
        due_date: updates.due_date || null,
        section_id: updates.section_id || null,
        position: updates.position ?? maxPos,
        status: updates.status || "todo",
        created_by: user?.id,
      })
      .select()
      .single();

    if (data && !error) {
      setTasks([...tasks, data]);
      if (user?.id) {
        logActivity({ project_id: projectId, user_id: user.id, action: "created task", detail: data.title });
      }
    }
  }

  async function handleArchiveProject() {
    if (!project) return;
    await supabase.from("projects").update({ status: project.status === "archived" ? "active" : "archived" }).eq("id", projectId);
    setProject({ ...project, status: project.status === "archived" ? "active" : "archived" });
    setProjectMenuOpen(false);
  }

  async function handleDeleteProject() {
    if (!project) return;
    const { error } = await supabase.from("projects").delete().eq("id", projectId);
    if (!error) {
      router.push("/projects");
    }
  }

  async function handleBulkDelete(taskIds: string[]) {
    const deletedTasks = tasks.filter((t) => taskIds.includes(t.id));
    const { error } = await supabase.from("tasks").delete().in("id", taskIds);
    if (!error) {
      setTasks((prev) => prev.filter((t) => !taskIds.includes(t.id)));
      setSelectedTask(null);
      if (currentUser) {
        logActivity({ project_id: projectId, user_id: currentUser, action: `deleted ${taskIds.length} tasks`, detail: "" });
      }
      addToast(
        `Deleted ${taskIds.length} task${taskIds.length !== 1 ? "s" : ""}`,
        "success",
        async () => {
          for (const t of deletedTasks) {
            const { data } = await supabase.from("tasks").insert(t).select().single();
            if (data) setTasks((prev) => [...prev, data]);
          }
        },
      );
    }
  }

  async function handleBulkMove(taskIds: string[], sectionId: string) {
    const movedTasks = tasks.filter((t) => taskIds.includes(t.id)).map((t) => ({ id: t.id, section_id: t.section_id, status: t.status }));
    const status = getStatusForSection(sectionId);
    const { error } = await supabase
      .from("tasks")
      .update({ section_id: sectionId, status, updated_at: new Date().toISOString() })
      .in("id", taskIds);
    if (!error) {
      setTasks((prev) =>
        prev.map((t) =>
          taskIds.includes(t.id) ? { ...t, section_id: sectionId, status } : t
        )
      );
      if (currentUser) {
        const sectionName = sections.find((s) => s.id === sectionId)?.name || "section";
        logActivity({ project_id: projectId, user_id: currentUser, action: `moved ${taskIds.length} tasks to`, detail: sectionName });
      }
      addToast(
        `Moved ${taskIds.length} task${taskIds.length !== 1 ? "s" : ""}`,
        "success",
        async () => {
          for (const t of movedTasks) {
            await supabase.from("tasks").update({ section_id: t.section_id, status: t.status, updated_at: new Date().toISOString() }).eq("id", t.id);
          }
          setTasks((prev) =>
            prev.map((t) => {
              const old = movedTasks.find((m) => m.id === t.id);
              return old ? { ...t, section_id: old.section_id, status: old.status } : t;
            })
          );
        },
      );
    }
  }

  async function handleBulkAssign(taskIds: string[], userId: string) {
    for (const taskId of taskIds) {
      await supabase.from("task_assignees").upsert({ task_id: taskId, user_id: userId }, { onConflict: "task_id,user_id" });
    }
    setTasks((prev) =>
      prev.map((t) =>
        taskIds.includes(t.id)
          ? { ...t, assignee_ids: [...new Set([...(t.assignee_ids || []), userId])] }
          : t
      )
    );
    if (currentUser) {
      const assigneeName = memberProfiles[userId] || userId;
      logActivity({ project_id: projectId, user_id: currentUser, action: `assigned ${assigneeName} to`, detail: `${taskIds.length} tasks` });
    }
  }

  function getStatusForSection(sectionId: string): Task["status"] {
    const sorted = [...sections].sort((a, b) => a.position - b.position);
    const idx = sorted.findIndex((s) => s.id === sectionId);
    if (sorted.length <= 1) return "todo";
    if (idx === 0) return "todo";
    if (idx >= sorted.length - 1) return "done";
    return "in_progress";
  }

  const subtaskCounts: Record<string, { total: number; done: number }> = {};
  tasks.forEach((t) => {
    if (t.parent_id) {
      if (!subtaskCounts[t.parent_id]) {
        subtaskCounts[t.parent_id] = { total: 0, done: 0 };
      }
      subtaskCounts[t.parent_id].total++;
      if (t.status === "done") subtaskCounts[t.parent_id].done++;
    }
  });

  const parentTasks = tasks.filter((t) => !t.parent_id);

  const filteredTasks = parentTasks.filter((t) => {
    if (filterSearch && !t.title.toLowerCase().includes(filterSearch.toLowerCase())) return false;
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    if (filterAssignee !== "all" && t.assignee_id !== filterAssignee) return false;
    return true;
  }).sort((a, b) => {
    let cmp = 0;
    if (sortBy === "title") cmp = a.title.localeCompare(b.title);
    else if (sortBy === "priority") {
      const order = { urgent: 0, high: 1, medium: 2, low: 3 };
      cmp = order[a.priority] - order[b.priority];
    }
    else if (sortBy === "due_date") {
      if (!a.due_date && !b.due_date) cmp = 0;
      else if (!a.due_date) cmp = 1;
      else if (!b.due_date) cmp = -1;
      else cmp = a.due_date.localeCompare(b.due_date);
    }
    else if (sortBy === "status") {
      const order = { todo: 0, in_progress: 1, done: 2 };
      cmp = order[a.status] - order[b.status];
    }
    else if (sortBy === "created_at") cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    else cmp = a.position - b.position;
    return sortDir === "asc" ? cmp : -cmp;
  });

  const hasActiveFilters = filterSearch || filterStatus !== "all" || filterPriority !== "all" || filterAssignee !== "all";

  if (loading || !project) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-slate-200 dark:border-slate-700 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/projects"
            className="p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="flex items-center gap-3">
            <div
              className="h-4 w-4 rounded-full"
              style={{ backgroundColor: project.color }}
            />
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{project.name}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Member Avatars */}
          <div className="hidden sm:flex items-center -space-x-2 mr-2">
            {members.slice(0, 5).map((member) => (
              <Avatar
                key={member.id}
                name={memberProfiles[member.user_id]}
                email={member.user_email || member.user_id}
                size="sm"
                className="ring-2 ring-white dark:ring-slate-900"
              />
            ))}
            {members.length > 5 && (
              <div className="h-6 w-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-medium text-slate-600 dark:text-slate-300 ring-2 ring-white dark:ring-slate-900">
                +{members.length - 5}
              </div>
            )}
          </div>
          {/* View Toggle */}
          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
            <button
              onClick={() => setView("board")}
              className={`p-1.5 rounded-md transition-colors ${view === "board" ? "bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-slate-500"}`}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setView("list")}
              className={`p-1.5 rounded-md transition-colors ${view === "list" ? "bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-slate-500"}`}
            >
              <List size={16} />
            </button>
          </div>
          <Button onClick={() => setShowAddTask(true)} size="sm">
            <Plus size={14} />
            Add Task
          </Button>
          {/* Project Menu */}
          <div className="relative">
            <button
              onClick={() => setProjectMenuOpen(!projectMenuOpen)}
              className="p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <MoreVertical size={16} />
            </button>
            {projectMenuOpen && (
              <div className="absolute right-0 top-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg py-1 z-10 min-w-[180px]">
                <button
                  onClick={() => void handleArchiveProject()}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <Archive size={14} />
                  {project.status === "archived" ? "Restore Project" : "Archive Project"}
                </button>
                <button
                  onClick={() => { setConfirmDelete(true); setProjectMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <Trash2 size={14} />
                  Delete Project
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-slate-900 dark:text-slate-100"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="all">All Status</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="all">All Priority</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
        <select
          value={filterAssignee}
          onChange={(e) => setFilterAssignee(e.target.value)}
          className="text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="all">All Assignees</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {memberProfiles[m.user_id] || m.user_email || m.user_id}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="position">Default order</option>
            <option value="title">Title</option>
            <option value="priority">Priority</option>
            <option value="due_date">Due date</option>
            <option value="status">Status</option>
            <option value="created_at">Created</option>
          </select>
          <button
            onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            title={sortDir === "asc" ? "Ascending" : "Descending"}
          >
            <ArrowUpDown size={14} className={sortDir === "desc" ? "rotate-180" : ""} />
          </button>
        </div>
        {hasActiveFilters && (
          <button
            onClick={() => { setFilterSearch(""); setFilterStatus("all"); setFilterPriority("all"); setFilterAssignee("all"); }}
            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <X size={12} />
            Clear
          </button>
        )}
        {hasActiveFilters && (
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {filteredTasks.length} of {parentTasks.length} tasks
          </span>
        )}
      </div>

      {/* Custom Fields Manager */}
      <div className="mb-4">
        <CustomFieldsPanel projectId={projectId} />
      </div>

      {/* Board / List */}
      {view === "board" ? (
        <KanbanBoard
          tasks={filteredTasks}
          sections={sections}
          subtaskCounts={subtaskCounts}
          teamMembers={members}
          memberProfiles={memberProfiles}
          onUpdateTask={handleUpdateTask}
          onDeleteTask={handleDeleteTask}
          onAddTask={handleAddTaskFromBoard}
          onAddSection={handleAddSection}
          onUpdateSection={handleUpdateSection}
          onDeleteSection={handleDeleteSection}
          onTaskClick={setSelectedTask}
          onBulkDelete={handleBulkDelete}
          onBulkMove={handleBulkMove}
          onBulkAssign={handleBulkAssign}
        />
      ) : (
        <ListView
          tasks={filteredTasks}
          onUpdateTask={handleUpdateTask}
          onDeleteTask={handleDeleteTask}
          onTaskClick={setSelectedTask}
          onBulkDelete={handleBulkDelete}
          onBulkMove={handleBulkMove}
          onBulkAssign={handleBulkAssign}
        />
      )}

      {/* Add Task Modal */}
      <Modal open={showAddTask} onClose={() => setShowAddTask(false)} title="Add Task">
        <form onSubmit={handleAddTask} className="space-y-4">
          <Input
            label="Task Title"
            placeholder="What needs to be done?"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            required
          />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Priority</label>
            <select
              value={newTaskPriority}
              onChange={(e) => setNewTaskPriority(e.target.value as Task["priority"])}
              className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Assignee</label>
            <select
              value={newTaskAssignee}
              onChange={(e) => setNewTaskAssignee(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {memberProfiles[member.user_id] || member.user_email || member.user_id}
                </option>
              ))}
            </select>
          </div>
          {sections.length > 0 && (
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Section</label>
              <select
                value={newTaskSection}
                onChange={(e) => setNewTaskSection(e.target.value)}
                className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">No section</option>
                {[...sections]
                  .sort((a, b) => a.position - b.position)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
          <Input
            label="Due Date"
            type="date"
            value={newTaskDueDate}
            onChange={(e) => setNewTaskDueDate(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowAddTask(false)}>
              Cancel
            </Button>
            <Button type="submit">Add Task</Button>
          </div>
        </form>
      </Modal>

      {/* Task Detail Modal */}
      <TaskDetailModal
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        onUpdate={handleUpdateTask}
        onDelete={handleDeleteTask}
        availableTags={tags}
        teamMembers={members}
        sections={sections}
      />

      {/* Delete Project Confirmation */}
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete Project">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Are you sure you want to delete <strong>{project.name}</strong>? This will permanently remove the project and all its tasks.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void handleDeleteProject()}>
              Delete Project
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
