"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Plus, FolderKanban } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import { PROJECT_COLORS, type Project, type Team } from "@/lib/types";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newTeamId, setNewTeamId] = useState("");
  const [newColor, setNewColor] = useState<string>(PROJECT_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: memberships } = await supabase
        .from("team_members")
        .select("team_id, teams(*)")
        .eq("user_id", user.id);

      if (memberships) {
        const teamList = (memberships as { teams: Team }[]).map((m) => m.teams).filter(Boolean);
        setTeams(teamList);
        if (teamList.length > 0) setNewTeamId(teamList[0].id);
      }

      const { data: projectsData } = await supabase
        .from("projects")
        .select("*")
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (projectsData) setProjects(projectsData);
      setLoading(false);
    }
    void load();
  }, [supabase]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newTeamId) return;
    setCreating(true);

    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("projects")
      .insert({
        name: newName.trim(),
        description: newDesc.trim() || null,
        team_id: newTeamId,
        color: newColor,
        created_by: user?.id,
      })
      .select()
      .single();

    if (data && !error) {
      setProjects([data, ...projects]);
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
    }
    setCreating(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Projects</h1>
          <p className="text-sm text-slate-500 mt-1">Manage all your team projects</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus size={16} />
          New Project
        </Button>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-16">
          <FolderKanban size={48} className="text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">No projects yet</h3>
          <p className="text-sm text-slate-500 mb-4">Create your first project to get started</p>
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={16} />
            Create Project
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-indigo-300 hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className="h-10 w-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: project.color + "20" }}
                >
                  <FolderKanban size={20} style={{ color: project.color }} />
                </div>
                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: project.color }} />
              </div>
              <h3 className="font-semibold text-slate-900 mb-1 group-hover:text-indigo-600 transition-colors">
                {project.name}
              </h3>
              {project.description && (
                <p className="text-sm text-slate-500 line-clamp-2 mb-3">{project.description}</p>
              )}
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="capitalize">{project.status}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Project">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Project Name"
            placeholder="e.g. Future Barbados Website"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
          />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">Description</label>
            <textarea
              placeholder="What is this project about?"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
              rows={3}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">Team</label>
            <select
              value={newTeamId}
              onChange={(e) => setNewTeamId(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">Color</label>
            <div className="flex gap-2">
              {PROJECT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewColor(color)}
                  className={`h-8 w-8 rounded-lg transition-all ${newColor === color ? "ring-2 ring-offset-2 ring-indigo-500" : ""}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={creating}>
              {creating ? "Creating..." : "Create Project"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
