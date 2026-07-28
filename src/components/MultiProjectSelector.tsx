"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { FolderKanban, X, Plus } from "lucide-react";
import { type ProjectSummary, type Project } from "@/lib/types";

interface MultiProjectSelectorProps {
  taskId: string;
  primaryProjectId: string;
  currentProjects: ProjectSummary[];
  onUpdate: (taskId: string, updates: { projects?: ProjectSummary[] }) => Promise<void>;
}

export default function MultiProjectSelector({
  taskId,
  primaryProjectId,
  currentProjects,
  onUpdate,
}: MultiProjectSelectorProps) {
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    async function loadProjects() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: memberships } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id);

      if (!memberships || memberships.length === 0) return;

      const teamIds = memberships.map((m: { team_id: string }) => m.team_id);
      const { data } = await supabase
        .from("projects")
        .select("id, name, color")
        .in("team_id", teamIds)
        .eq("status", "active");

      if (data) setAllProjects(data);
    }
    void loadProjects();
  }, [supabase]);

  const linkedIds = new Set(currentProjects.map((p) => p.id));
  const available = allProjects.filter((p) => p.id !== primaryProjectId && !linkedIds.has(p.id));

  async function handleAdd(projectId: string) {
    const { error } = await supabase
      .from("task_projects")
      .insert({ task_id: taskId, project_id: projectId });

    if (!error) {
      const project = allProjects.find((p) => p.id === projectId);
      if (project) {
        await onUpdate(taskId, { projects: [...currentProjects, { id: project.id, name: project.name, color: project.color }] });
      }
    }
    setShowDropdown(false);
  }

  async function handleRemove(projectId: string) {
    const { error } = await supabase
      .from("task_projects")
      .delete()
      .eq("task_id", taskId)
      .eq("project_id", projectId);

    if (!error) {
      await onUpdate(taskId, { projects: currentProjects.filter((p) => p.id !== projectId) });
    }
  }

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
        <FolderKanban size={12} /> Also in Projects
      </label>

      <div className="flex flex-wrap gap-1">
        {currentProjects.map((p) => (
          <span
            key={p.id}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: `${p.color}20`, color: p.color }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.color }} />
            {p.name}
            <button
              onClick={() => handleRemove(p.id)}
              className="ml-0.5 hover:opacity-70"
            >
              <X size={10} />
            </button>
          </span>
        ))}

        {available.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500"
            >
              <Plus size={10} /> Add project
            </button>

            {showDropdown && (
              <div className="absolute z-50 mt-1 w-56 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 max-h-48 overflow-y-auto">
                {available.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleAdd(p.id)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
