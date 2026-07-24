"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Home,
  CheckSquare,
  Calendar,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  Plus,
  X,
  Send,
  FolderKanban,
} from "lucide-react";
import { cn, generateSlug } from "@/lib/utils";
import { logActivity } from "@/lib/activities";
import type { User } from "@supabase/supabase-js";
import type { Team, Project } from "@/lib/types";

interface SidebarProps {
  user: User;
  expanded: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

interface TeamWithProjects extends Team {
  projects: Project[];
}

export default function Sidebar({
  user,
  expanded,
  onToggle,
  mobileOpen,
  onMobileClose,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const [teams, setTeams] = useState<TeamWithProjects[]>([]);
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const [quickAddProjectId, setQuickAddProjectId] = useState("");
  const [quickAddLoading, setQuickAddLoading] = useState(false);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDesc, setNewTeamDesc] = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [teamError, setTeamError] = useState("");

  const loadData = useCallback(async () => {
    try {
      const { data: memberships, error } = await supabase
        .from("team_members")
        .select("team_id, teams(id, name, description, created_at)")
        .eq("user_id", user.id);

      if (error || !memberships) return;

      const teamList = (memberships as { teams: Team }[])
        .map((m) => m.teams)
        .filter(Boolean);

      const teamsWithProjects: TeamWithProjects[] = await Promise.all(
        teamList.map(async (team) => {
          const { data: projects } = await supabase
            .from("projects")
            .select("id, name, team_id, status, created_at")
            .eq("team_id", team.id)
            .order("name");

          return {
            ...team,
            projects: (projects as Project[]) || [],
          };
        })
      );

      setTeams(teamsWithProjects);
    } catch {
      // Table might not exist yet
    }
  }, [supabase, user.id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function toggleTeam(teamId: string) {
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
      }
      return next;
    });
  }

  async function handleQuickAdd() {
    if (!quickAddTitle.trim() || !quickAddProjectId) return;
    setQuickAddLoading(true);

    try {
      const { error } = await supabase.from("tasks").insert({
        title: quickAddTitle.trim(),
        project_id: quickAddProjectId,
        assignee_id: user.id,
        created_by: user.id,
        status: "todo",
        priority: "medium",
        position: 0,
      });

      if (!error) {
        setQuickAddTitle("");
        setQuickAddProjectId("");
        setShowQuickAdd(false);
        logActivity({ user_id: user.id, project_id: quickAddProjectId, action: "created task via quick add", detail: quickAddTitle.trim() });
      }
    } catch {
      // Silently fail
    } finally {
      setQuickAddLoading(false);
    }
  }

  function handleQuickAddKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleQuickAdd();
    }
    if (e.key === "Escape") {
      setShowQuickAdd(false);
      setQuickAddTitle("");
    }
  }

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    setCreatingTeam(true);
    setTeamError("");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setTeamError("You must be logged in.");
        setCreatingTeam(false);
        return;
      }

      const { data: org } = await supabase
        .from("organizations")
        .select("id")
        .limit(1)
        .single();

      if (!org) {
        setTeamError("Could not find organization. Please contact support.");
        setCreatingTeam(false);
        return;
      }

      const { data: team, error: teamError } = await supabase
        .from("teams")
        .insert({
          org_id: org.id,
          name: newTeamName.trim(),
          slug: generateSlug(newTeamName),
          description: newTeamDesc.trim() || null,
        })
        .select()
        .single();

      if (teamError) {
        setTeamError(teamError.message || "Failed to create team.");
        setCreatingTeam(false);
        return;
      }

      const { error: memberError } = await supabase.from("team_members").insert({
        team_id: team.id,
        user_id: user.id,
        role: "owner",
      });

      if (memberError) {
        setTeamError("Team created but failed to add you as owner.");
        setCreatingTeam(false);
        return;
      }

      setTeams([...teams, { ...team, projects: [] }]);
      setShowCreateTeam(false);
      setNewTeamName("");
      setNewTeamDesc("");
      setExpandedTeams(new Set([team.id]));
    } catch {
      setTeamError("An unexpected error occurred.");
    }
    setCreatingTeam(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  const navItems = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/my-tasks", icon: CheckSquare, label: "My Tasks" },
    { href: "/calendar", icon: Calendar, label: "Calendar" },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-4 flex items-center justify-between">
        {expanded ? (
          <Link href="/" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-indigo-600 flex items-center justify-center">
              <span className="text-white font-bold text-xs">WD</span>
            </div>
            <span className="font-bold text-slate-900 text-sm tracking-tight">
              Wah We Doin
            </span>
          </Link>
        ) : (
          <Link href="/" className="mx-auto">
            <div className="h-7 w-7 rounded-md bg-indigo-600 flex items-center justify-center">
              <span className="text-white font-bold text-xs">WD</span>
            </div>
          </Link>
        )}
      </div>

      {/* Quick Add */}
      {expanded && (
        <div className="px-3 pb-2">
          {showQuickAdd ? (
            <div className="space-y-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">
              <input
                autoFocus
                type="text"
                placeholder="Task name"
                value={quickAddTitle}
                onChange={(e) => setQuickAddTitle(e.target.value)}
                onKeyDown={handleQuickAddKeyDown}
                className="w-full bg-transparent text-sm text-slate-900 placeholder-slate-400 outline-none"
              />
              <select
                value={quickAddProjectId}
                onChange={(e) => setQuickAddProjectId(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Select project...</option>
                {teams.flatMap((team) =>
                  team.projects.map((p) => (
                    <option key={p.id} value={p.id}>{team.name} / {p.name}</option>
                  ))
                )}
              </select>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => void handleQuickAdd()}
                  disabled={quickAddLoading || !quickAddTitle.trim() || !quickAddProjectId}
                  className={cn(
                    "px-2 py-1 text-xs font-medium rounded-md transition-colors",
                    quickAddTitle.trim() && quickAddProjectId
                      ? "text-white bg-indigo-600 hover:bg-indigo-700"
                      : "text-slate-300 bg-slate-100 cursor-not-allowed"
                  )}
                >
                  {quickAddLoading ? "Adding..." : "Add"}
                </button>
                <button
                  onClick={() => {
                    setShowQuickAdd(false);
                    setQuickAddTitle("");
                    setQuickAddProjectId("");
                  }}
                  className="px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 rounded-md transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowQuickAdd(true)}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
            >
              <Plus size={16} />
              <span>Quick Add</span>
            </button>
          )}
        </div>
      )}

      {!expanded && (
        <div className="px-2 pb-2 flex justify-center">
          <button
            onClick={() => setShowQuickAdd(true)}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
            title="Quick Add"
          >
            <Plus size={18} />
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="px-3 py-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onMobileClose}
              className={cn(
                "flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <item.icon
                size={18}
                className={cn(
                  isActive ? "text-indigo-600" : "text-slate-400"
                )}
              />
              {expanded && <span className="flex-1">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Teams Section */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {expanded && (
          <div className="px-3 py-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Teams
            </span>
            <button
              onClick={() => setShowCreateTeam(true)}
              className="p-0.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
              title="New Team"
            >
              <Plus size={14} />
            </button>
          </div>
        )}

        {teams.length === 0 ? (
          expanded ? (
            <div className="px-3 py-4">
              <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-4 text-center">
                <p className="text-xs text-slate-500 mb-3">No teams yet</p>
                <button
                  onClick={() => setShowCreateTeam(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                >
                  <Plus size={12} />
                  Create Team
                </button>
              </div>
            </div>
          ) : (
            <div className="px-2 pb-2 flex justify-center">
              <button
                onClick={() => setShowCreateTeam(true)}
                className="p-2 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                title="New Team"
              >
                <Plus size={18} />
              </button>
            </div>
          )
        ) : (
          <div className="space-y-0.5">
            {teams.map((team) => {
              const isTeamExpanded = expandedTeams.has(team.id);
              const teamActive = pathname.startsWith(`/teams/${team.id}`);
              return (
                <div key={team.id}>
                  {expanded ? (
                    <div className="flex items-center gap-0">
                      <button
                        onClick={() => toggleTeam(team.id)}
                        className="p-1 rounded text-slate-400 hover:text-slate-600 shrink-0"
                      >
                        {isTeamExpanded ? (
                          <ChevronDown size={14} />
                        ) : (
                          <ChevronRightIcon size={14} />
                        )}
                      </button>
                      <Link
                        href={`/teams/${team.id}`}
                        onClick={onMobileClose}
                        className={cn(
                          "flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm font-medium transition-colors truncate",
                          teamActive
                            ? "bg-indigo-50 text-indigo-700"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        )}
                      >
                        <span className="truncate">{team.name}</span>
                        <span className="text-[11px] text-slate-400 shrink-0">
                          {team.projects.length}
                        </span>
                      </Link>
                    </div>
                  ) : (
                    <Link
                      href={`/teams/${team.id}`}
                      onClick={onMobileClose}
                      className="flex items-center justify-center py-1"
                      title={team.name}
                    >
                      <div
                        className={cn(
                          "h-6 w-6 rounded-md flex items-center justify-center transition-colors",
                          teamActive ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-600"
                        )}
                      >
                        <span className="text-[10px] font-semibold">
                          {team.name.slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                    </Link>
                  )}

                  {/* Projects under team */}
                  {expanded && isTeamExpanded && (
                    <div className="ml-5 pl-3 border-l border-slate-100 space-y-0.5 pb-1">
                      {team.projects.map((project) => {
                        const projectActive = pathname === `/projects/${project.id}`;
                        return (
                          <Link
                            key={project.id}
                            href={`/projects/${project.id}`}
                            onClick={onMobileClose}
                            className={cn(
                              "flex items-center gap-2 px-2 py-1 rounded-md text-sm transition-colors",
                              projectActive
                                ? "bg-indigo-50 text-indigo-700 font-medium"
                                : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                            )}
                          >
                            <FolderKanban
                              size={14}
                              className="shrink-0"
                              style={{ color: project.color }}
                            />
                            <span className="truncate">{project.name}</span>
                          </Link>
                        );
                      })}
                      <Link
                        href={`/projects?team=${team.id}`}
                        onClick={onMobileClose}
                        className="flex items-center gap-2 px-2 py-1 rounded-md text-sm text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                      >
                        <Plus size={12} className="shrink-0" />
                        <span className="text-xs">Add Project</span>
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-slate-200 space-y-0.5">
        <Link
          href="/settings"
          onClick={onMobileClose}
          className={cn(
            "flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
            pathname === "/settings"
              ? "bg-indigo-50 text-indigo-700"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          )}
        >
          <Settings size={18} className="text-slate-400" />
          {expanded && <span>Settings</span>}
        </Link>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors w-full"
        >
          <LogOut size={18} className="text-slate-400" />
          {expanded && <span>Sign Out</span>}
        </button>
      </div>

      {/* Collapse Toggle (desktop only) */}
      <button
        onClick={onToggle}
        className="hidden md:flex items-center justify-center py-2 border-t border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
      >
        {expanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:flex fixed inset-y-0 left-0 z-40 flex-col bg-white border-r border-slate-200 transition-all duration-200",
          expanded ? "w-64" : "w-16"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50 md:hidden"
            onClick={onMobileClose}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 md:hidden">
            {sidebarContent}
          </aside>
        </>
      )}

      {/* Create Team Modal */}
      {showCreateTeam && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50"
            onClick={() => setShowCreateTeam(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold text-slate-900">Create Team</h2>
                <button
                  onClick={() => setShowCreateTeam(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={(e) => void handleCreateTeam(e)} className="space-y-4">
                {teamError && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                    {teamError}
                  </div>
                )}
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-slate-700">Team Name</label>
                  <input
                    autoFocus
                    type="text"
                    placeholder="e.g. Nuffinarians"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-slate-700">Description</label>
                  <textarea
                    placeholder="What does this team do?"
                    value={newTeamDesc}
                    onChange={(e) => setNewTeamDesc(e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                    rows={3}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateTeam(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingTeam || !newTeamName.trim()}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {creatingTeam ? "Creating..." : "Create Team"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </>
  );
}
