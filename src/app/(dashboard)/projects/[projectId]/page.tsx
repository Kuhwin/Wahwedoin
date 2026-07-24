"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Plus, LayoutGrid, List } from "lucide-react";
import Link from "next/link";
import KanbanBoard from "@/components/kanban/KanbanBoard";
import ListView from "@/components/kanban/ListView";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import { type Project, type Task, type Section, type TeamMember } from "@/lib/types";

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
  const [view, setView] = useState<"board" | "list">("board");
  const [loading, setLoading] = useState(true);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<Task["priority"]>("medium");
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const supabase = createClient();
  const projectId = params.projectId as string;

  const loadData = useCallback(async () => {
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

    if (membersData) setMembers(membersData);
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
      setShowAddTask(false);
    }
  }

  async function handleUpdateTask(taskId: string, updates: Partial<Task>) {
    const { error } = await supabase
      .from("tasks")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", taskId);

    if (!error) {
      setTasks(tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)));
    }
  }

  async function handleDeleteTask(taskId: string) {
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    if (!error) {
      setTasks(tasks.filter((t) => t.id !== taskId));
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
    }
  }

  async function handleUpdateSection(sectionId: string, updates: Partial<Section>) {
    const { error } = await supabase
      .from("sections")
      .update(updates)
      .eq("id", sectionId);

    if (!error) {
      setSections(sections.map((s) => (s.id === sectionId ? { ...s, ...updates } : s)));
    }
  }

  async function handleDeleteSection(sectionId: string) {
    const { error } = await supabase.from("sections").delete().eq("id", sectionId);
    if (!error) {
      setSections(sections.filter((s) => s.id !== sectionId));
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
        />
      ) : (
        <ListView
          tasks={tasks}
          onUpdateTask={handleUpdateTask}
          onDeleteTask={handleDeleteTask}
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
          <Input
            label="Assignee (User ID)"
            placeholder="User ID"
            value={newTaskAssignee}
            onChange={(e) => setNewTaskAssignee(e.target.value)}
          />
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
    </div>
  );
}
