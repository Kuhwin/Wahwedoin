"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Plus, LayoutGrid, List, Archive, Trash2, MoreVertical } from "lucide-react";
import Link from "next/link";
import KanbanBoard from "@/components/kanban/KanbanBoard";
import ListView from "@/components/kanban/ListView";
import TaskDetailModal from "@/components/tasks/TaskDetailModal";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Avatar from "@/components/ui/Avatar";
import { type Project, type Task, type Section, type TeamMember, type Tag } from "@/lib/types";
import { cn } from "@/lib/utils";
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
  const [memberProfiles, setMemberProfiles] = useState<Record<string, string>>({});
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const supabase = createClient();
  const projectId = params.projectId as string;

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUser(user.id);

    const { data: projectData } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (!projectData) {
      router.push("/projects");
      return;
    }
    setProject(projectData);

    const { data: tasksData } = await supabase
      .from("tasks")
      .select("*")
      .eq("project_id", projectId)
      .order("position", { ascending: true });

    if (tasksData) setTasks(tasksData);

    const { data: sectionsData } = await supabase
      .from("sections")
      .select("*")
      .eq("project_id", projectId)
      .order("position", { ascending: true });

    if (sectionsData && sectionsData.length > 0) {
      setSections(sectionsData);
    } else {
      const inserted = await supabase
        .from("sections")
        .insert(
          DEFAULT_SECTIONS.map((s) => ({
            ...s,
            project_id: projectId,
          }))
        )
        .select();

      if (inserted.data) setSections(inserted.data);
    }

    const { data: membersData } = await supabase
      .from("team_members")
      .select("*")
      .eq("team_id", projectData.team_id);

    if (membersData) {
      setMembers(membersData);
      // Load member profiles
      const userIds = membersData.map((m: TeamMember) => m.user_id);
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

    // Load team tags
    if (projectData.team_id) {
      const { data: tagsData } = await supabase
        .from("tags")
        .select("*")
        .eq("team_id", projectData.team_id);
      if (tagsData) setTags(tagsData);
    }

    setLoading(false);
  }, [projectId, supabase, router]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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
    const { error } = await supabase
      .from("tasks")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", taskId);

    if (!error) {
      setTasks(tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)));
      setSelectedTask((prev) =>
        prev && prev.id === taskId ? { ...prev, ...updates } : prev
      );
      // Log activity for meaningful changes
      if (currentUser) {
        const task = tasks.find((t) => t.id === taskId);
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

  if (loading || !project) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
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
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="flex items-center gap-3">
            <div
              className="h-4 w-4 rounded-full"
              style={{ backgroundColor: project.color }}
            />
            <h1 className="text-xl font-bold text-slate-900">{project.name}</h1>
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
                className="ring-2 ring-white"
              />
            ))}
            {members.length > 5 && (
              <div className="h-6 w-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-medium text-slate-600 ring-2 ring-white">
                +{members.length - 5}
              </div>
            )}
          </div>
          {/* View Toggle */}
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            <button
              onClick={() => setView("board")}
              className={`p-1.5 rounded-md transition-colors ${view === "board" ? "bg-white shadow-sm text-indigo-600" : "text-slate-400"}`}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setView("list")}
              className={`p-1.5 rounded-md transition-colors ${view === "list" ? "bg-white shadow-sm text-indigo-600" : "text-slate-400"}`}
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
              className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            >
              <MoreVertical size={16} />
            </button>
            {projectMenuOpen && (
              <div className="absolute right-0 top-10 bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-10 min-w-[180px]">
                <button
                  onClick={() => void handleArchiveProject()}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <Archive size={14} />
                  {project.status === "archived" ? "Restore Project" : "Archive Project"}
                </button>
                <button
                  onClick={() => { setConfirmDelete(true); setProjectMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={14} />
                  Delete Project
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Board / List */}
      {view === "board" ? (
        <KanbanBoard
          tasks={tasks}
          sections={sections}
          onUpdateTask={handleUpdateTask}
          onDeleteTask={handleDeleteTask}
          onAddSection={handleAddSection}
          onUpdateSection={handleUpdateSection}
          onDeleteSection={handleDeleteSection}
          onTaskClick={setSelectedTask}
        />
      ) : (
        <ListView
          tasks={tasks}
          onUpdateTask={handleUpdateTask}
          onDeleteTask={handleDeleteTask}
          onTaskClick={setSelectedTask}
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
            <label className="block text-sm font-medium text-slate-700">Priority</label>
            <select
              value={newTaskPriority}
              onChange={(e) => setNewTaskPriority(e.target.value as Task["priority"])}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">Assignee</label>
            <select
              value={newTaskAssignee}
              onChange={(e) => setNewTaskAssignee(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
              <label className="block text-sm font-medium text-slate-700">Section</label>
              <select
                value={newTaskSection}
                onChange={(e) => setNewTaskSection(e.target.value)}
                className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
          <p className="text-sm text-slate-600">
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
