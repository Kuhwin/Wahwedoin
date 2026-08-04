"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Plus, FolderKanban, Archive, Trash2, MoreVertical } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import { PROJECT_COLORS, type Project, type Team } from "@/lib/types";

export default function ProjectsPage() {
  const searchParams = useSearchParams();
  const teamParam = searchParams.get("team");
  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [orgNameById, setOrgNameById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newTeamId, setNewTeamId] = useState("");
  const [newColor, setNewColor] = useState<string>(PROJECT_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null);
  const [filter, setFilter] = useState<"active" | "archived">("active");
  const menuRef = useRef<HTMLDivElement>(null);
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
        // Prefer ?team=... if the user is a member of it, else fall back to
        // the first team in the list.
        if (teamParam && teamList.some((t) => t.id === teamParam)) {
          setNewTeamId(teamParam);
        } else if (teamList.length > 0 && !newTeamId) {
          setNewTeamId(teamList[0].id);
        }

        // Load organization names for the teams' orgs so the team
        // selector can group/show "Team Name — Org Name" and users can
        // find the right team across multiple organizations.
        const orgIds = Array.from(new Set(teamList.map((t) => t.org_id).filter((id): id is string => !!id)));
        if (orgIds.length > 0) {
          const { data: orgs } = await supabase
            .from("organizations")
            .select("id, name")
            .in("id", orgIds);
          const map: Record<string, string> = {};
          (orgs || []).forEach((o: { id: string; name: string }) => { map[o.id] = o.name; });
          setOrgNameById(map);
        }
      }

      const { data: projectsData } = await supabase
        .from("projects")
        .select("*")
        .eq("status", filter)
        .order("created_at", { ascending: false });

      if (projectsData) setProjects(projectsData);
      setLoading(false);
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, filter]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newTeamId) return;
    setCreating(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();

    const { data, error: createError } = await supabase
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

    if (createError) {
      setError(createError.message || "Failed to create project. Please try again.");
      setCreating(false);
      return;
    }

    if (data) {
      setProjects([data, ...projects]);
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      setError(null);
    }
    setCreating(false);
  }

  async function handleArchive(projectId: string) {
    await supabase.from("projects").update({ status: "archived" }).eq("id", projectId);
    setProjects(projects.filter((p) => p.id !== projectId));
    setMenuOpen(null);
  }

  async function handleDelete(project: Project) {
    const { error } = await supabase.from("projects").delete().eq("id", project.id);
    if (error) {
      console.error("Delete project error:", error);
      alert("Failed to delete project: " + error.message);
      return;
    }
    setProjects(projects.filter((p) => p.id !== project.id));
    setConfirmDelete(null);
    setMenuOpen(null);
  }

  async function handleRestore(projectId: string) {
    await supabase.from("projects").update({ status: "active" }).eq("id", projectId);
    setProjects(projects.filter((p) => p.id !== projectId));
    setMenuOpen(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-slate-200 dark:border-slate-700 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Projects</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage all your team projects</p>
        </div>
        <Button onClick={() => { setError(null); setShowCreate(true); }}>
          <Plus size={16} />
          New Project
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 mb-6 w-fit">
        <button
          onClick={() => setFilter("active")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            filter === "active" ? "bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          Active
        </button>
        <button
          onClick={() => setFilter("archived")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            filter === "archived" ? "bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          Archived
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-16">
          <FolderKanban size={48} className="text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">No projects yet</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Create your first project to get started</p>
          <Button onClick={() => { setError(null); setShowCreate(true); }}>
            <Plus size={16} />
            Create Project
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 hover:border-accent/50 hover:shadow-md transition-all group relative"
            >
              <Link href={`/projects/${project.id}`} className="block">
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: project.color + "20" }}
                  >
                    <FolderKanban size={20} style={{ color: project.color }} />
                  </div>
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: project.color }} />
                </div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1 group-hover:text-accent dark:group-hover:text-accent transition-colors">
                  {project.name}
                </h3>
                {project.description && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-3">{project.description}</p>
                )}
                <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                  <span className="capitalize">{project.status}</span>
                </div>
              </Link>
              {/* Dropdown */}
              <div className="absolute top-3 right-3" ref={(el) => { if (menuOpen === project.id && menuRef.current) menuRef.current = el; }}>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(menuOpen === project.id ? null : project.id); }}
                  className="p-1 rounded-md text-slate-300 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <MoreVertical size={16} />
                </button>
                {menuOpen === project.id && (
                  <div className="absolute right-0 top-8 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg py-1 z-10 min-w-[160px]">
                    {filter === "active" ? (
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); void handleArchive(project.id); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                      >
                        <Archive size={14} />
                        Archive
                      </button>
                    ) : (
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); void handleRestore(project.id); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                      >
                        <Archive size={14} />
                        Restore
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDelete(project); setMenuOpen(null); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setError(null); }} title="Create Project">
        <form onSubmit={handleCreate} className="space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}
          <Input
            label="Project Name"
            placeholder="e.g. Beach Cleanup Drive"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
          />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Description</label>
            <textarea
              placeholder="What is this project about?"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 resize-none"
              rows={3}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Team</label>
            <select
              value={newTeamId}
              onChange={(e) => setNewTeamId(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
            >
              {(() => {
                // Group teams by organization so users can find the right
                // team across multiple orgs. Teams without an org_id
                // (legacy / no-org) fall into an "Other" group.
                const byOrg = new Map<string, Team[]>();
                const noOrg: Team[] = [];
                teams.forEach((t) => {
                  if (t.org_id) {
                    if (!byOrg.has(t.org_id)) byOrg.set(t.org_id, []);
                    byOrg.get(t.org_id)!.push(t);
                  } else {
                    noOrg.push(t);
                  }
                });
                const sortedOrgIds = Array.from(byOrg.keys()).sort((a, b) =>
                  (orgNameById[a] || "").localeCompare(orgNameById[b] || "")
                );
                return (
                  <>
                    {sortedOrgIds.map((orgId) => {
                      const orgName = orgNameById[orgId] || "Organization";
                      const group = byOrg.get(orgId)!.slice().sort((a, b) => a.name.localeCompare(b.name));
                      return (
                        <optgroup key={orgId} label={orgName}>
                          {group.map((team) => (
                            <option key={team.id} value={team.id}>{team.name}</option>
                          ))}
                        </optgroup>
                      );
                    })}
                    {noOrg.length > 0 && (
                      <optgroup label="Other">
                        {noOrg.map((team) => (
                          <option key={team.id} value={team.id}>{team.name}</option>
                        ))}
                      </optgroup>
                    )}
                  </>
                );
              })()}
            </select>
          </div>
          <div className="space-y-1">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Colour</label>
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
            <Button variant="secondary" type="button" onClick={() => { setShowCreate(false); setError(null); }}>
              Cancel
            </Button>
            <Button type="submit" disabled={creating}>
              {creating ? "Creating..." : "Create Project"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete Project">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Are you sure you want to delete <strong>{confirmDelete?.name}</strong>? This will permanently remove the project and all its tasks.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => confirmDelete && void handleDelete(confirmDelete)}>
              Delete Project
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
