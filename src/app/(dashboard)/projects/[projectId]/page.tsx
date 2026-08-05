"use client";

import { useEffect, useLayoutEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Plus, LayoutGrid, List, Archive, Trash2, MoreVertical, Search, X, ArrowUpDown, BarChart3, GanttChart, CalendarDays, CalendarClock } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import CustomFieldsPanel from "@/components/CustomFieldsPanel";
import ProjectAnalytics from "@/components/ProjectAnalytics";
import DriveLinkPanel from "@/components/DriveLinkPanel";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Avatar from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { type Project, type Task, type Section, type TeamMember, type Tag, type ProjectSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { logActivity } from "@/lib/activities";
import Skeleton from "@/components/ui/Skeleton";
import ExportButton from "@/components/ExportButton";
import { useRealtimeRefresh } from "@/lib/useRealtimeRefresh";

const KanbanBoard = dynamic(() => import("@/components/kanban/KanbanBoard"), { ssr: false });
const ListView = dynamic(() => import("@/components/kanban/ListView"), { ssr: false });
const GanttView = dynamic(() => import("@/components/kanban/GanttView"), { ssr: false });
const ProjectEvents = dynamic(() => import("@/components/project/ProjectEvents"), { ssr: false });
const TaskDetailModal = dynamic(() => import("@/components/tasks/TaskDetailModal"), { ssr: false });

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
  const [view, setView] = useState<"board" | "list" | "gantt" | "events">("board");
  const [loading, setLoading] = useState(true);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<Task["priority"]>("medium");
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskStartDate, setNewTaskStartDate] = useState("");
  const [newTaskSection, setNewTaskSection] = useState("");
  const [newTaskRecurrence, setNewTaskRecurrence] = useState("");
  const [newTaskRecurrenceEnd, setNewTaskRecurrenceEnd] = useState("");
  const [newTaskMilestone, setNewTaskMilestone] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showKeyDates, setShowKeyDates] = useState(false);
  const [keyStart, setKeyStart] = useState("");
  const [keyDue, setKeyDue] = useState("");
  const [savingKeyDates, setSavingKeyDates] = useState(false);
  const { addToast } = useToast();

  const selectedTaskRef = useRef(selectedTask);
  useEffect(() => {
    selectedTaskRef.current = selectedTask;
  }, [selectedTask]);
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
  const [showAnalytics, setShowAnalytics] = useState(false);
  const supabase = createClient();
  const projectId = params.projectId as string;

  const projectFetcher = useCallback(async () => {
    const [{ data: { user } }, { data: projectData }] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from("projects")
        .select("id, name, team_id, status, created_at, description, drive_account_id, drive_folder_id, drive_folder_name, start_date, due_date")
        .eq("id", projectId)
        .single(),
    ]);

    if (!projectData) return null;

    const [tasksRes, sectionsRes, membersRes, tagsRes, multiHomedRes, allProjectsRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("*, task_projects!task_id(project_id)")
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
            .select("id, team_id, user_id, name, color, created_at")
            .or(`team_id.eq.${projectData.team_id},user_id.eq.${user?.id}`)
        : supabase
            .from("tags")
            .select("id, team_id, user_id, name, color, created_at")
            .eq("user_id", user?.id || ""),
      supabase
        .from("task_projects")
        .select("task_id, project_id")
        .eq("project_id", projectId),
      projectData.team_id
        ? supabase
            .from("projects")
            .select("id, name, color, team_id")
            .eq("team_id", projectData.team_id)
        : Promise.resolve({ data: [] }),
    ]);

    const allTasks: Task[] = [...(tasksRes.data || [])];

    const multiHomedIds = (multiHomedRes.data || [])
      .map((tp: { task_id: string }) => tp.task_id)
      .filter((id: string) => !allTasks.some((t) => t.id === id));

    const userIds = (membersRes.data || []).map((m: TeamMember) => m.user_id);

    const [extraTasksResult, profilesResult] = await Promise.all([
      multiHomedIds.length > 0
        ? supabase
            .from("tasks")
            .select("*, task_projects!task_id(project_id)")
            .in("id", multiHomedIds)
            .order("position", { ascending: true })
        : Promise.resolve({ data: [] }),
      userIds.length > 0
        ? supabase
            .from("user_profiles")
            .select("user_id, display_name")
            .in("user_id", userIds)
        : Promise.resolve({ data: [] }),
    ]);

    if (extraTasksResult.data) allTasks.push(...extraTasksResult.data);

    if (allTasks.length > 0) {
      const projectMap = new Map<string, ProjectSummary>();
      (allProjectsRes.data || []).forEach((p: ProjectSummary) => projectMap.set(p.id, p));
      allTasks.forEach((t) => {
        if (!t.projects) t.projects = [];
        const extraIds = (t.task_projects || [])
          .map((tp: { project_id: string }) => tp.project_id)
          .filter((pid: string) => pid !== projectId);
        t.projects = extraIds
          .map((pid: string) => projectMap.get(pid))
          .filter((p): p is ProjectSummary => !!p);
      });
    }

    let sections = sectionsRes.data || [];
    if (sections.length === 0) {
      const inserted = await supabase
        .from("sections")
        .insert(DEFAULT_SECTIONS.map((s) => ({ ...s, project_id: projectId })))
        .select();
      if (inserted.data) sections = inserted.data;
    }

    const memberProfilesMap: Record<string, string> = {};
    if (profilesResult.data) {
      profilesResult.data.forEach((p: { user_id: string; display_name: string }) => { memberProfilesMap[p.user_id] = p.display_name; });
    }

    return {
      currentUserId: user?.id || null,
      project: projectData,
      tasks: allTasks,
      sections,
      members: membersRes.data || [],
      memberProfiles: memberProfilesMap,
      tags: tagsRes.data || [],
    };
  }, [projectId, supabase]);

  const { data: projectData, mutate: projectMutate } = useSWR(
    projectId ? `project:${projectId}` : null,
    projectFetcher,
    { dedupingInterval: 30000, revalidateOnFocus: false, revalidateOnReconnect: false }
  );

  useRealtimeRefresh({
    tables: ["tasks", "sections", "task_assignees", "task_projects"],
    swrKeys: [projectId ? `project:${projectId}` : null],
  });

  // Seed the local state from SWR (project:<id>) and keep it in sync
  // with every SWR revalidation so that realtime updates (other users
  // adding/editing tasks, the realtime hook's mutate, and the
  // optimistic adds in the handlers below) actually appear in the UI.
  // Previously a projectLoaded ref guarded this to run only on the
  // first load, which left the local state stale: new tasks added in
  // this session were appended optimistically and the optimistic
  // closure was sometimes stale, and any change from another session
  // (realtime) updated SWR but never reached local state.
  useEffect(() => {
    if (!projectData) return;
    setCurrentUser(projectData.currentUserId);
    setProject(projectData.project);
    setTasks(projectData.tasks);
    setSections(projectData.sections);
    setMembers(projectData.members);
    setMemberProfiles(projectData.memberProfiles);
    setTags(projectData.tags);
    setLoading(false);
  }, [projectData]);

  // Force the browser back button on this page to return to the team's
  // workspace, no matter how the user reached the project. We do this
  // with the History API directly so there is no visible flash: on
  // the first layout effect where we know the project's team, we
  // rewrite the current history entry to the team URL (replaceState)
  // and then push the project URL back on top (pushState). The visible
  // page stays the project (no re-render), but the history is now
  // [..., /teams/<id>, /projects/<id>], so the browser back button
  // returns to the team.
  useLayoutEffect(() => {
    if (!project?.team_id) return;
    const teamId = project.team_id;
    const projectPath = window.location.pathname;
    // Skip if the history was already fixed for this team (StrictMode
    // double-invoke in dev runs effects twice; check the previous
    // entry's state we tagged).
    if ((window.history.state as { backFixedToTeam?: string } | null)?.backFixedToTeam === teamId) {
      return;
    }
    window.history.replaceState({ backFixedToTeam: teamId }, "", `/teams/${teamId}`);
    window.history.pushState(null, "", projectPath);
  }, [project]);

  // Safety net: if the user presses back before the project data
  // loads (so the layout effect above hasn't fixed the history yet),
  // or if /projects somehow remains the previous entry, intercept
  // popstate and route them to the team directly.
  const backHandledRef = useRef(false);
  useEffect(() => {
    if (!project?.team_id) return;
    const teamId = project.team_id;
    function onPopState() {
      if (backHandledRef.current) return;
      backHandledRef.current = true;
      const path = window.location.pathname;
      if (!path.startsWith(`/teams/${teamId}`)) {
        window.history.forward();
        router.replace(`/teams/${teamId}`);
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [project, router]);

  const handleUpdateTask = useCallback(async (taskId: string, updates: Partial<Task>) => {
    let taskTitle = "task";
    let savedTask: Task | undefined;

    const finalUpdates: Partial<Task> = { ...updates };
    if ("status" in updates && updates.status && sections.length > 0 && !("section_id" in updates)) {
      const sorted = [...sections].sort((a, b) => a.position - b.position);
      const idx = updates.status === "done" ? sorted.length - 1 : updates.status === "todo" ? 0 : Math.min(1, sorted.length - 1);
      finalUpdates.section_id = sorted[idx]?.id || null;
    }

    setTasks((prev) => {
      const task = prev.find((t) => t.id === taskId);
      if (task) savedTask = { ...task };
      taskTitle = task?.title || "task";
      return prev.map((t) => (t.id === taskId ? { ...t, ...finalUpdates } : t));
    });
    setSelectedTask((prev) =>
      prev && prev.id === taskId ? { ...prev, ...finalUpdates } : prev
    );

    const { projects, ...dbUpdates } = finalUpdates;
    void projects;
    const { error } = await supabase
      .from("tasks")
      .update({ ...dbUpdates, updated_at: new Date().toISOString() })
      .eq("id", taskId);

    if (error) {
      if (savedTask) {
        setTasks((prev) => prev.map((t) => (t.id === taskId ? savedTask! : t)));
        setSelectedTask((prev) => prev && prev.id === taskId ? savedTask! : prev);
      }
    } else {
      const oldSectionId = savedTask?.section_id ?? null;
      const oldStatus = savedTask?.status ?? "todo";
      if (savedTask && "section_id" in finalUpdates && finalUpdates.section_id !== oldSectionId) {
        addToast(
          `Moved "${taskTitle}"`,
          "success",
          async () => {
            await supabase.from("tasks").update({ section_id: oldSectionId, status: oldStatus, updated_at: new Date().toISOString() }).eq("id", taskId);
            setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, section_id: oldSectionId, status: oldStatus } : t)));
          },
        );
      }
      if (currentUser) {
        if ("status" in updates) {
          const statusLabel = updates.status === "done" ? "completed" : updates.status === "in_progress" ? "started" : "reopened";
          logActivity({ project_id: projectId, task_id: taskId, user_id: currentUser, action: `${statusLabel} task`, detail: taskTitle });
        } else if ("assignee_id" in updates) {
          logActivity({ project_id: projectId, task_id: taskId, user_id: currentUser, action: "changed assignee on", detail: taskTitle });
        } else if ("priority" in updates) {
          logActivity({ project_id: projectId, task_id: taskId, user_id: currentUser, action: `set priority ${updates.priority} on`, detail: taskTitle });
        } else if ("due_date" in updates) {
          logActivity({ project_id: projectId, task_id: taskId, user_id: currentUser, action: "updated due date on", detail: taskTitle });
        } else if ("title" in updates || "description" in updates) {
          logActivity({ project_id: projectId, task_id: taskId, user_id: currentUser, action: "edited", detail: taskTitle });
        } else if ("section_id" in finalUpdates) {
          logActivity({ project_id: projectId, task_id: taskId, user_id: currentUser, action: "moved", detail: taskTitle });
        }
      }
    }
  }, [supabase, currentUser, projectId, addToast, sections]);

  const getStatusForSection = useCallback((sectionId: string): Task["status"] => {
    const sorted = [...sections].sort((a, b) => a.position - b.position);
    const idx = sorted.findIndex((s) => s.id === sectionId);
    if (sorted.length <= 1) return "todo";
    if (idx === 0) return "todo";
    if (idx >= sorted.length - 1) return "done";
    return "in_progress";
  }, [sections]);

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

    // The Kanban board groups tasks into columns by section_id, so a
    // task with section_id = null would never appear in any column
    // (it shows in the List, Gantt, etc. because they don't group by
    // section). When the form doesn't choose a section, default to
    // the "To Do" section so the task lands in the To Do column.
    // Fall back to the first section by position if there is no
    // "To Do" section.
    let resolvedSectionId: string | null = newTaskSection || null;
    if (!resolvedSectionId && sections.length > 0) {
      const todoSection =
        sections.find((s) => s.name.toLowerCase() === "to do") ||
        sections.find((s) => s.name.toLowerCase() === "todo") ||
        [...sections].sort((a, b) => a.position - b.position)[0];
      resolvedSectionId = todoSection ? todoSection.id : null;
    }

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        project_id: projectId,
        title: newTaskTitle.trim(),
        status: "todo",
        priority: newTaskPriority,
        assignee_id: newTaskAssignee || null,
        due_date: newTaskDueDate || null,
        start_date: newTaskStartDate || null,
        section_id: resolvedSectionId,
        position: maxPos,
        created_by: user?.id,
        recurrence: newTaskRecurrence || null,
        recurrence_end: newTaskRecurrenceEnd || null,
        is_milestone: newTaskMilestone,
      })
      .select()
      .single();

    if (data && !error) {
      setTasks((prev) => [...prev, data]);
      // Force an SWR revalidation so the new task is read back from
      // the server and any other client state (sections, members,
      // etc.) is refreshed. The realtime hook also revalidates, but
      // calling mutate here guarantees a fetch even if realtime is
      // delayed or unavailable.
      void projectMutate();
      setNewTaskTitle("");
      setNewTaskPriority("medium");
      setNewTaskAssignee("");
      setNewTaskDueDate("");
      setNewTaskStartDate("");
      setNewTaskSection("");
      setNewTaskRecurrence("");
      setNewTaskRecurrenceEnd("");
      setNewTaskMilestone(false);
      setShowAddTask(false);
      addToast(`Created "${data.title}"`, "success");
      if (user?.id) {
        logActivity({ project_id: projectId, task_id: data.id, user_id: user.id, action: "created task", detail: data.title });
      }
    } else {
      // Surface insert failures so the user knows the task wasn't created
      // (e.g. RLS policy, schema mismatch, or a transient error).
      addToast(
        `Could not create task${error ? `: ${error.message}` : ""}`,
        "error",
      );
    }
  }


  const handleDeleteTask = useCallback(async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!window.confirm(`Delete "${task?.title || "this task"}"? You can undo this.`)) return;
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    if (!error) {
      setTasks(tasks.filter((t) => t.id !== taskId));
      setSelectedTask(null);
      if (currentUser) {
        logActivity({ project_id: projectId, task_id: taskId, user_id: currentUser, action: "deleted task", detail: task?.title });
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
  }, [supabase, tasks, currentUser, projectId, addToast]);

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
    if (!window.confirm(`Delete section "${section?.name || ""}"? Tasks in this section won't be deleted.`)) return;
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

    // Default the section to "To Do" when the board's quick-add doesn't
    // specify one, so the task gets a section label on the card.
    let resolvedSectionId: string | null = updates.section_id || null;
    if (!resolvedSectionId && sections.length > 0) {
      const todoSection =
        sections.find((s) => s.name.toLowerCase() === "to do") ||
        sections.find((s) => s.name.toLowerCase() === "todo") ||
        [...sections].sort((a, b) => a.position - b.position)[0];
      resolvedSectionId = todoSection ? todoSection.id : null;
    }

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        project_id: projectId,
        title: updates.title || "Untitled",
        priority: updates.priority || "medium",
        assignee_id: updates.assignee_id || null,
        due_date: updates.due_date || null,
        section_id: resolvedSectionId,
        position: updates.position ?? maxPos,
        status: updates.status || "todo",
        created_by: user?.id,
      })
      .select()
      .single();

    if (data && !error) {
      setTasks((prev) => [...prev, data]);
      void projectMutate();
      if (user?.id) {
        logActivity({ project_id: projectId, task_id: data.id, user_id: user.id, action: "created task", detail: data.title });
      }
    } else {
      addToast(
        `Could not create task${error ? `: ${error.message}` : ""}`,
        "error",
      );
    }
  }

  async function handleArchiveProject() {
    if (!project) return;
    const newStatus = project.status === "archived" ? "active" : "archived";
    const action = newStatus === "archived" ? "Archive" : "Restore";
    if (!window.confirm(`${action} "${project.name}"?`)) return;
    const { error } = await supabase.from("projects").update({ status: newStatus }).eq("id", projectId);
    if (error) { addToast(error.message, "error"); return; }
    setProject({ ...project, status: newStatus });
    setProjectMenuOpen(false);
    addToast(newStatus === "archived" ? `Archived "${project.name}"` : `Restored "${project.name}"`, "success");
  }

  async function handleDeleteProject() {
    if (!project) return;
    const { error } = await supabase.from("projects").delete().eq("id", projectId);
    if (!error) {
      router.push("/all-projects");
    }
  }

  function openKeyDates() {
    setKeyStart(project?.start_date || "");
    setKeyDue(project?.due_date || "");
    setShowKeyDates(true);
  }

  async function handleSaveKeyDates() {
    if (!project) return;
    setSavingKeyDates(true);
    const start = keyStart || null;
    const due = keyDue || null;
    if (start && due && start > due) {
      addToast("Start date must be before the due date", "error");
      setSavingKeyDates(false);
      return;
    }
    const { error } = await supabase
      .from("projects")
      .update({ start_date: start, due_date: due })
      .eq("id", projectId);
    if (error) {
      addToast(error.message, "error");
    } else {
      setProject({ ...project, start_date: start, due_date: due });
      setShowKeyDates(false);
      addToast("Key dates saved", "success");
    }
    setSavingKeyDates(false);
  }

  const handleBulkDelete = useCallback(async (taskIds: string[]) => {
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
  }, [supabase, tasks, currentUser, projectId, addToast]);

  const handleBulkMove = useCallback(async (taskIds: string[], sectionId: string) => {
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
  }, [supabase, tasks, currentUser, sections, projectId, addToast, getStatusForSection]);

  const handleBulkAssign = useCallback(async (taskIds: string[], userId: string) => {
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
      if (userId !== currentUser) {
        const title = `You were assigned to ${taskIds.length} task${taskIds.length !== 1 ? "s" : ""}`;
        const body = `Assigned by ${memberProfiles[currentUser] || currentUser}`;
        const link = `/projects/${projectId}`;
        await supabase.from("notifications").insert({ user_id: userId, title, body, type: "task", link });
        void fetch("/api/notifications/send-assignment", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, title, body, link }),
        });
      }
    }
  }, [supabase, currentUser, memberProfiles, projectId]);

  const subtaskCounts = useMemo(() => {
    const counts: Record<string, { total: number; done: number }> = {};
    tasks.forEach((t) => {
      if (t.parent_id) {
        if (!counts[t.parent_id]) counts[t.parent_id] = { total: 0, done: 0 };
        counts[t.parent_id].total++;
        if (t.status === "done") counts[t.parent_id].done++;
      }
    });
    return counts;
  }, [tasks]);

  const { sectionCounts, unsectioned } = useMemo(() => {
    const counts: Record<string, { total: number; done: number }> = {};
    sections.forEach((s) => { counts[s.id] = { total: 0, done: 0 }; });
    let unsectioned = 0;
    tasks.forEach((t) => {
      if (t.section_id && counts[t.section_id]) {
        counts[t.section_id].total++;
        if (t.status === "done") counts[t.section_id].done++;
      }
      if (!t.section_id && t.status !== "done") unsectioned++;
    });
    return { sectionCounts: counts, unsectioned };
  }, [tasks, sections]);

  const { filteredTasks, allFilteredTasks, totalParentTasks } = useMemo(() => {
    const parentTasks = tasks.filter((t) => !t.parent_id);
    const parentIds = new Set(parentTasks.map((t) => t.id));
    void parentIds;

    const filtered = parentTasks.filter((t) => {
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

    const filteredParentIds = new Set(filtered.map((t) => t.id));
    const subtasks = tasks.filter((t) => t.parent_id && filteredParentIds.has(t.parent_id));
    const allFiltered = [...filtered, ...subtasks];

    return { filteredTasks: filtered, allFilteredTasks: allFiltered, totalParentTasks: parentTasks.length };
  }, [tasks, filterSearch, filterStatus, filterPriority, filterAssignee, sortBy, sortDir]);

  const hasActiveFilters = filterSearch || filterStatus !== "all" || filterPriority !== "all" || filterAssignee !== "all";

  if (loading || !project) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-6 w-48" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-6 w-24 rounded-lg" />
              <Skeleton className="h-32 rounded-xl" />
              <Skeleton className="h-20 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => project?.team_id && router.push(`/teams/${project.team_id}`)}
            disabled={!project?.team_id}
            className="p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Back to team"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-3">
            <div
              className="h-4 w-4 rounded-full"
              style={{ backgroundColor: project.color }}
            />
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{project.name}</h1>
            {tasks.some((t) => t.is_milestone) && (
              <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full font-medium">
                ◆ {tasks.filter((t) => t.is_milestone && t.status === "done").length}/{tasks.filter((t) => t.is_milestone).length} milestones
              </span>
            )}
            <button
              onClick={openKeyDates}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 transition-colors"
              title="Edit key dates"
            >
              <CalendarClock size={12} />
              {project.start_date && project.due_date
                ? `${project.start_date} → ${project.due_date}`
                : project.start_date
                  ? `Starts ${project.start_date}`
                  : project.due_date
                    ? `Due ${project.due_date}`
                    : "Set key dates"}
            </button>
            {sections.length > 0 && (
              <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap">
                {sections.map((s) => (
                  <span key={s.id} className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                    {sectionCounts[s.id]?.total || 0}
                  </span>
                ))}
                {unsectioned > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                    {unsectioned}
                  </span>
                )}
              </span>
            )}
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
              className={`p-1.5 rounded-md transition-colors ${view === "board" ? "bg-white dark:bg-slate-700 shadow-sm text-accent" : "text-slate-400 dark:text-slate-500"}`}
              title="Board"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setView("list")}
              className={`p-1.5 rounded-md transition-colors ${view === "list" ? "bg-white dark:bg-slate-700 shadow-sm text-accent" : "text-slate-400 dark:text-slate-500"}`}
              title="List"
            >
              <List size={16} />
            </button>
            <button
              onClick={() => setView("gantt")}
              className={`p-1.5 rounded-md transition-colors ${view === "gantt" ? "bg-white dark:bg-slate-700 shadow-sm text-accent" : "text-slate-400 dark:text-slate-500"}`}
              title="Timeline (Gantt)"
            >
              <GanttChart size={16} />
            </button>
            <button
              onClick={() => setView("events")}
              className={`p-1.5 rounded-md transition-colors ${view === "events" ? "bg-white dark:bg-slate-700 shadow-sm text-accent" : "text-slate-400 dark:text-slate-500"}`}
              title="Events"
            >
              <CalendarDays size={16} />
            </button>
          </div>
          <ExportButton
            data={filteredTasks.map(task => ({
              title: task.title,
              status: task.status,
              priority: task.priority,
              due_date: task.due_date || "",
              section: sections.find(s => s.id === task.section_id)?.name || "",
              assignee: task.assignee_id ? (memberProfiles[task.assignee_id] || task.assignee_id) : "",
              created_at: task.created_at,
            }))}
            filename={`${project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_tasks.csv`}
          />
          <button
            onClick={() => setShowAnalytics(!showAnalytics)}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              showAnalytics
                ? "bg-indigo-100 dark:bg-indigo-900/30 text-accent"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            <BarChart3 size={16} />
          </button>
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
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent/50 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-slate-900 dark:text-slate-100"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-accent/50"
        >
          <option value="all">All Status</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-accent/50"
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
          className="text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-accent/50"
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
            className="text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-accent/50"
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
            {filteredTasks.length} of {totalParentTasks} tasks
          </span>
        )}
      </div>

      {/* Custom Fields Manager */}
      <div className="mb-4">
        <CustomFieldsPanel projectId={projectId} />
      </div>

      {/* Google Drive Folder */}
      <div className="mb-4">
        <DriveLinkPanel
          tableName="projects"
          recordId={projectId}
          accountId={project.drive_account_id}
          folderId={project.drive_folder_id}
          folderName={project.drive_folder_name}
          onLinked={() => void projectMutate()}
        />
      </div>

      {/* Analytics */}
      {showAnalytics && <ProjectAnalytics tasks={tasks} />}

      {/* Board / List / Gantt / Events */}
      {view === "board" && (
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
      )}
      {view === "list" && (
        <ListView
          tasks={allFilteredTasks}
          onUpdateTask={handleUpdateTask}
          onDeleteTask={handleDeleteTask}
          onTaskClick={setSelectedTask}
          onBulkDelete={handleBulkDelete}
          onBulkMove={handleBulkMove}
          onBulkAssign={handleBulkAssign}
          assignees={members.map((m) => ({ id: m.user_id, name: memberProfiles[m.user_id] || m.user_id }))}
          subtaskCounts={subtaskCounts}
        />
      )}
      {view === "gantt" && (
        <GanttView
          tasks={allFilteredTasks}
          onTaskClick={setSelectedTask}
          projectStart={project.start_date}
          projectDue={project.due_date}
          projectColor={project.color}
        />
      )}
      {view === "events" && (
        <ProjectEvents projectId={projectId} teamId={project.team_id} projectColor={project.color} />
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
              className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
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
              className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
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
                className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
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
          <Input
            label="Start Date (for timeline)"
            type="date"
            value={newTaskStartDate}
            onChange={(e) => setNewTaskStartDate(e.target.value)}
          />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Repeat</label>
            <select
              value={newTaskRecurrence}
              onChange={(e) => setNewTaskRecurrence(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
            >
              <option value="">Does not repeat</option>
              <option value="daily">Every day</option>
              <option value="weekly">Every week</option>
              <option value="biweekly">Every 2 weeks</option>
              <option value="monthly">Every month</option>
              <option value="yearly">Every year</option>
            </select>
          </div>
          {newTaskRecurrence && (
            <Input
              label="Repeat Until (optional)"
              type="date"
              value={newTaskRecurrenceEnd}
              onChange={(e) => setNewTaskRecurrenceEnd(e.target.value)}
            />
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={newTaskMilestone}
              onChange={(e) => setNewTaskMilestone(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">Milestone</span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">— key deliverable</span>
          </label>
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

      {/* Key Dates Modal */}
      <Modal open={showKeyDates} onClose={() => setShowKeyDates(false)} title="Key Dates">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Key dates are project-level start and due dates — they show in the project header and on the timeline.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Start Date" type="date" value={keyStart} onChange={(e) => setKeyStart(e.target.value)} />
            <Input label="Due Date" type="date" value={keyDue} onChange={(e) => setKeyDue(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowKeyDates(false)}>Cancel</Button>
            <Button onClick={() => void handleSaveKeyDates()} disabled={savingKeyDates}>{savingKeyDates ? "Saving..." : "Save"}</Button>
          </div>
        </div>
      </Modal>

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
