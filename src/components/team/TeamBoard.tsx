"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { LayoutGrid, Filter } from "lucide-react";
import KanbanBoard from "@/components/kanban/KanbanBoard";
import { type Task, type Section, type TeamMember, type Project } from "@/lib/types";

interface TeamBoardProps {
  teamId: string;
  members: TeamMember[];
  memberProfiles: Record<string, string>;
}

export default function TeamBoard({ teamId, members, memberProfiles }: TeamBoardProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const supabase = createClient();

  const loadData = useCallback(async () => {
    const { data: projectsData } = await supabase
      .from("projects")
      .select("*")
      .eq("team_id", teamId)
      .order("name");

    if (projectsData) {
      setProjects(projectsData);
      const projectIds = projectsData.map((p: Project) => p.id);

      if (projectIds.length > 0) {
        const { data: tasksData } = await supabase
          .from("tasks")
          .select("*")
          .in("project_id", projectIds)
          .order("position");

        if (tasksData) setTasks(tasksData);

        // Load sections from all projects
        const { data: sectionsData } = await supabase
          .from("sections")
          .select("*")
          .in("project_id", projectIds)
          .order("position");

        if (sectionsData) {
          // Deduplicate sections by name+color (since different projects may have same section names)
          const seen = new Map<string, Section>();
          for (const s of sectionsData) {
            const key = `${s.name}-${s.color}`;
            if (!seen.has(key)) {
              seen.set(key, s);
            }
          }
          setSections([...seen.values()].sort((a, b) => a.position - b.position));
        }
      }
    }
    setLoading(false);
  }, [teamId, supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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

  const filteredTasks = tasks.filter((t) => {
    if (filterProject !== "all" && t.project_id !== filterProject) return false;
    if (filterAssignee !== "all" && t.assignee_id !== filterAssignee) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="text-center py-12 bg-white border border-slate-200 rounded-2xl">
        <LayoutGrid size={40} className="text-slate-300 mx-auto mb-3" />
        <p className="text-sm text-slate-500">No projects in this team yet. Create a project to see tasks here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-slate-400" />
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
          >
            <option value="all">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <select
          value={filterAssignee}
          onChange={(e) => setFilterAssignee(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
        >
          <option value="all">All Members</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {memberProfiles[m.user_id] || m.user_email || m.user_id}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-400">{filteredTasks.length} tasks</span>
      </div>

      <KanbanBoard
        tasks={filteredTasks}
        sections={sections}
        onUpdateTask={handleUpdateTask}
        onDeleteTask={handleDeleteTask}
        onAddSection={async () => {}}
        onUpdateSection={async () => {}}
        onDeleteSection={async () => {}}
        onTaskClick={() => {}}
      />
    </div>
  );
}
