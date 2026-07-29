"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
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
  FolderKanban,
  MoreVertical,
  Trash2,
  FolderOpen,
  Mail,
  Inbox,
  Briefcase,
  Building2,
  Users,
} from "lucide-react";
import { cn, generateSlug } from "@/lib/utils";
import { logActivity } from "@/lib/activities";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import OrgSettingsModal from "@/components/org/OrgSettingsModal";
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
  const [orgsById, setOrgsById] = useState<Record<string, { id: string; name: string; slug: string; cover_photo_url: string | null }>>({});
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set());
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const [quickAddProjectId, setQuickAddProjectId] = useState("");
  const [quickAddLoading, setQuickAddLoading] = useState(false);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [createTeamOrgId, setCreateTeamOrgId] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDesc, setNewTeamDesc] = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [teamError, setTeamError] = useState("");
  const [teamMenuOpen, setTeamMenuOpen] = useState<string | null>(null);
  const [confirmDeleteTeam, setConfirmDeleteTeam] = useState<TeamWithProjects | null>(null);
  const [orgSettings, setOrgSettings] = useState<{ orgId: string; orgName: string } | null>(null);

  function handleOrgUpdated(orgId?: string, newName?: string) {
    if (orgId && newName) {
      setOrgsById((prev) => {
        const existing = prev[orgId];
        if (!existing) return prev;
        return { ...prev, [orgId]: { ...existing, name: newName } };
      });
      setOrgSettings((prev) => {
        if (prev && prev.orgId === orgId) {
          return { ...prev, orgName: newName };
        }
        return prev;
      });
    }
    void loadData();
  }

  const loadData = useCallback(async () => {
    try {
      const { data: memberships, error } = await supabase
        .from("team_members")
        .select("team_id, teams(id, name, description, created_at, org_id, cover_photo_url)")
        .eq("user_id", user.id);

      if (error || !memberships) return;

      const teamList = (memberships as { teams: Team }[])
        .map((m) => m.teams)
        .filter(Boolean);

      // Also fetch all orgs the user is a member of (even those with no teams)
      const { data: orgMembers } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id);

      const memberOrgIds = (orgMembers || []).map((m: { org_id: string }) => m.org_id);

      const allOrgIds = [
        ...new Set([
          ...teamList.map((t) => t.org_id).filter(Boolean),
          ...memberOrgIds,
        ]),
      ] as string[];

      if (allOrgIds.length > 0) {
        const { data: orgs } = await supabase
          .from("organizations")
          .select("id, name, slug, cover_photo_url")
          .in("id", allOrgIds);
        if (orgs?.length) {
          const orgMap: Record<string, { id: string; name: string; slug: string; cover_photo_url: string | null }> = {};
          orgs.forEach((o: { id: string; name: string; slug: string; cover_photo_url: string | null }) => { orgMap[o.id] = o; });
          setOrgsById(orgMap);
          setExpandedOrgs(new Set(allOrgIds));
        }
      }

      const teamIds = teamList.map((t) => t.id);
      let allProjects: Project[] = [];
      if (teamIds.length > 0) {
        const { data: projectsData } = await supabase
          .from("projects")
          .select("id, name, team_id, status, created_at")
          .in("team_id", teamIds)
          .order("name");
        if (projectsData) allProjects = projectsData as Project[];
      }

      const projectsByTeam = new Map<string, Project[]>();
      allProjects.forEach((p) => {
        if (!projectsByTeam.has(p.team_id)) projectsByTeam.set(p.team_id, []);
        projectsByTeam.get(p.team_id)!.push(p);
      });

      const teamsWithProjects: TeamWithProjects[] = teamList.map((team) => ({
        ...team,
        projects: projectsByTeam.get(team.id) || [],
      }));

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
      const { data: newTask, error } = await supabase.from("tasks").insert({
        title: quickAddTitle.trim(),
        project_id: quickAddProjectId,
        assignee_id: user.id,
        created_by: user.id,
        status: "todo",
        priority: "medium",
        position: 0,
      }).select("id").single();

      if (!error) {
        setQuickAddTitle("");
        setQuickAddProjectId("");
        setShowQuickAdd(false);
        logActivity({ user_id: user.id, project_id: quickAddProjectId, task_id: newTask?.id, action: "created task via quick add", detail: quickAddTitle.trim() });
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

      const orgEntries = Object.values(orgsById);
      if (orgEntries.length === 0) {
        setTeamError("No organization found. Please contact support.");
        setCreatingTeam(false);
        return;
      }

      const targetOrgId = createTeamOrgId || orgEntries[0].id;
      const teamId = crypto.randomUUID();

      const { error: teamError } = await supabase.from("teams").insert({
        id: teamId,
        org_id: targetOrgId,
        name: newTeamName.trim(),
        slug: generateSlug(newTeamName) + "-" + crypto.randomUUID().slice(0, 4),
        description: newTeamDesc.trim() || null,
      });

      if (teamError) {
        setTeamError(teamError.message || "Failed to create team.");
        setCreatingTeam(false);
        return;
      }

      const { error: memberError } = await supabase.rpc("bootstrap_team_owner", {
        p_team_id: teamId,
        p_user_id: user.id,
      });

      if (memberError) {
        setTeamError(memberError.message);
        setCreatingTeam(false);
        return;
      }

      const { data: team } = await supabase
        .from("teams")
        .select("*")
        .eq("id", teamId)
        .single();

      if (!team) {
        setTeamError("Team created but failed to load team data.");
        setCreatingTeam(false);
        return;
      }

      setTeams([...teams, { ...team, projects: [] }]);
      setShowCreateTeam(false);
      setCreateTeamOrgId(null);
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

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setCreatingOrg(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setCreatingOrg(false); return; }

      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .insert({ name: newOrgName.trim(), slug: generateSlug(newOrgName.trim()) + "-" + crypto.randomUUID().slice(0, 4) })
        .select()
        .single();

      if (orgError) { setCreatingOrg(false); return; }

      const { error: memberError } = await supabase
        .from("org_members")
        .insert({ org_id: org.id, user_id: user.id, role: "owner" });

      if (memberError) { setCreatingOrg(false); return; }

      setShowCreateOrg(false);
      setNewOrgName("");
      void loadData();
    } catch {
      // ignore
    }
    setCreatingOrg(false);
  }

  async function handleDeleteTeam() {
    if (!confirmDeleteTeam) return;
    const { error } = await supabase.from("teams").delete().eq("id", confirmDeleteTeam.id);
    if (error) {
      alert("Failed to delete team: " + error.message);
      return;
    }
    setTeams(teams.filter((t) => t.id !== confirmDeleteTeam.id));
    setConfirmDeleteTeam(null);
    setTeamMenuOpen(null);
  }

  const navItems = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/my-tasks", icon: CheckSquare, label: "My Tasks" },
    { href: "/calendar", icon: Calendar, label: "Calendar" },
    { href: "/drive", icon: FolderOpen, label: "Drive" },
    { href: "/gmail", icon: Mail, label: "Gmail" },
    { href: "/inbox", icon: Inbox, label: "Inbox" },
    { href: "/manage", icon: Building2, label: "Manage" },
    { href: "/people", icon: Users, label: "People" },
    { href: "/portfolios", icon: Briefcase, label: "Portfolios" },
  ];

  const teamsByOrg = teams.reduce<Record<string, TeamWithProjects[]>>((acc, t) => {
    const oid = t.org_id || "__none__";
    if (!acc[oid]) acc[oid] = [];
    acc[oid].push(t);
    return acc;
  }, {});

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-4 flex items-center justify-between">
        {expanded ? (
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="Wah We Doin" width={28} height={28} className="h-7 w-7 rounded-md object-cover" />
            <span className="font-bold text-slate-900 text-sm tracking-tight dark:text-slate-100">
              Wah We Doin
            </span>
          </Link>
        ) : (
          <Link href="/" className="mx-auto">
            <Image src="/logo.png" alt="Wah We Doin" width={28} height={28} className="h-7 w-7 rounded-md object-cover" />
          </Link>
        )}
      </div>

      {/* Quick Add */}
      {expanded && (
        <div className="px-3 pb-2">
          {showQuickAdd ? (
            <div className="space-y-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 dark:bg-slate-800 dark:border-slate-700">
              <input
                autoFocus
                type="text"
                placeholder="Task name"
                value={quickAddTitle}
                onChange={(e) => setQuickAddTitle(e.target.value)}
                onKeyDown={handleQuickAddKeyDown}
                className="w-full bg-transparent text-sm text-slate-900 placeholder-slate-400 outline-none dark:text-slate-100"
              />
              <select
                value={quickAddProjectId}
                onChange={(e) => setQuickAddProjectId(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300"
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
                      : "text-slate-300 bg-slate-100 cursor-not-allowed dark:bg-slate-800"
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
                  className="px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 rounded-md transition-colors dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowQuickAdd(true)}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors dark:text-slate-400 dark:hover:bg-slate-800"
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
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors dark:text-slate-500 dark:hover:bg-slate-800"
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
                  ? "text-white"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:hover:bg-slate-800"
              )}
              style={isActive ? { backgroundColor: "var(--accent)" } : undefined}
            >
              <item.icon
                size={18}
                className={cn(
                  isActive ? "text-white" : "text-slate-400 dark:text-slate-500"
                )}
              />
              {expanded && <span className="flex-1">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Teams Section */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {teams.length === 0 ? (
          expanded ? (
            <div className="px-3 py-4 space-y-3">
              <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-4 text-center dark:bg-slate-800">
                <p className="text-xs text-slate-500 mb-3 dark:text-slate-400">No teams yet</p>
                <button
                  onClick={() => { setCreateTeamOrgId(null); setShowCreateTeam(true); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                >
                  <Plus size={12} />
                  Create Team
                </button>
              </div>
              <button
                onClick={() => setShowCreateOrg(true)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-indigo-600 rounded-lg transition-colors dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <Plus size={12} />
                New Organization
              </button>
            </div>
          ) : (
            <div className="px-2 pb-2 flex flex-col items-center gap-1">
              <button
                onClick={() => { setCreateTeamOrgId(null); setShowCreateTeam(true); }}
                className="p-2 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-indigo-600 transition-colors dark:text-slate-500 dark:hover:bg-slate-800"
                title="New Team"
              >
                <Plus size={18} />
              </button>
              <button
                onClick={() => setShowCreateOrg(true)}
                className="p-2 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-indigo-600 transition-colors dark:text-slate-500 dark:hover:bg-slate-800"
                title="New Organization"
              >
                <Building2 size={18} />
              </button>
            </div>
          )
        ) : (
          <div className="space-y-2">
            {Object.values(orgsById).map((org) => {
              const orgTeams = teamsByOrg[org.id] || [];
              const isOrgExpanded = expandedOrgs.has(org.id);
              return (
                <div key={org.id}>
                  {expanded && (
                    <div className="flex items-center gap-0 px-1 py-1">
                      <button
                        onClick={() => {
                          const next = new Set(expandedOrgs);
                          if (isOrgExpanded) next.delete(org.id); else next.add(org.id);
                          setExpandedOrgs(next);
                        }}
                        className="p-0.5 rounded text-slate-400 hover:text-slate-600 dark:text-slate-500"
                      >
                        {isOrgExpanded ? <ChevronDown size={12} /> : <ChevronRightIcon size={12} />}
                      </button>
                      {org.cover_photo_url ? (
                        <Image
                          src={org.cover_photo_url}
                          alt={org.name}
                          width={18}
                          height={18}
                          className="h-[18px] w-[18px] rounded object-cover ml-1"
                          unoptimized
                        />
                      ) : (
                        <span className="ml-1 h-[18px] w-[18px] rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[8px] font-bold text-slate-500 dark:text-slate-400">
                          {org.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider dark:text-slate-500 ml-1 truncate">
                        {org.name}
                      </span>
                      <Link
                        href={`/manage?org=${org.id}`}
                        onClick={onMobileClose}
                        className="ml-1 p-0.5 rounded text-slate-400 hover:text-slate-600 transition-colors dark:text-slate-500"
                        title="Manage Organization"
                      >
                        <Settings size={11} />
                      </Link>
                      <button
                        onClick={() => { setCreateTeamOrgId(org.id); setShowCreateTeam(true); }}
                        className="ml-auto p-0.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors dark:text-slate-500"
                        title="New Team"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  )}
                  {isOrgExpanded && (
                    <div className="space-y-0.5">
                      {orgTeams.length === 0 && expanded && (
                        <p className="text-[11px] text-slate-400 px-2 py-1">No teams</p>
                      )}
                      {orgTeams.map((team) => {
                        const isTeamExpanded = expandedTeams.has(team.id);
                        const teamActive = pathname.startsWith(`/teams/${team.id}`);
                        return (
                          <div key={team.id} className="group">
                            {expanded ? (
                              <div className="flex items-center gap-0">
                                <button
                                  onClick={() => toggleTeam(team.id)}
                                  className="p-1 rounded text-slate-400 hover:text-slate-600 shrink-0 dark:text-slate-500"
                                >
                                  {isTeamExpanded ? <ChevronDown size={14} /> : <ChevronRightIcon size={14} />}
                                </button>
                                <Link
                                  href={`/teams/${team.id}`}
                                  onClick={onMobileClose}
                                  className={cn(
                                    "flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm font-medium transition-colors truncate",
                                    teamActive
                                      ? "bg-indigo-50 text-indigo-700"
                                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:hover:bg-slate-800"
                                  )}
                                >
                                  {team.cover_photo_url ? (
                                    <Image
                                      src={team.cover_photo_url}
                                      alt={team.name}
                                      width={16}
                                      height={16}
                                      className="h-4 w-4 rounded object-cover shrink-0"
                                      unoptimized
                                    />
                                  ) : (
                                    <span className="h-4 w-4 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[8px] font-bold text-slate-500 dark:text-slate-400 shrink-0">
                                      {team.name.charAt(0).toUpperCase()}
                                    </span>
                                  )}
                                  <span className="truncate">{team.name}</span>
                                  <span className="text-[11px] text-slate-400 shrink-0 dark:text-slate-500">
                                    {team.projects.length}
                                  </span>
                                </Link>
                                <div className="relative">
                                  <button
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setTeamMenuOpen(teamMenuOpen === team.id ? null : team.id); }}
                                    className="p-1 rounded text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-all dark:text-slate-500 dark:hover:text-slate-300"
                                  >
                                    <MoreVertical size={14} />
                                  </button>
                                  {teamMenuOpen === team.id && (
                                    <div className="absolute right-0 top-7 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 z-20 min-w-[140px]">
                                      <button
                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDeleteTeam(team); setTeamMenuOpen(null); }}
                                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                                      >
                                        <Trash2 size={12} />
                                        Delete Team
                                      </button>
                                    </div>
                                  )}
                                </div>
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
                                          : "text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
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
                                  className="flex items-center gap-2 px-2 py-1 rounded-md text-sm text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors dark:text-slate-500"
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
              );
            })}
          </div>
        )}
        {expanded && (
          <div className="px-2 pt-2">
            <button
              onClick={() => setShowCreateOrg(true)}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition-colors dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <Plus size={14} />
              New Organization
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-slate-200 space-y-0.5 dark:border-slate-700">
        <Link
          href="/settings"
          onClick={onMobileClose}
          className={cn(
            "flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
            pathname === "/settings"
            ? "bg-indigo-50 text-indigo-700"
            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:hover:bg-slate-800"
          )}
        >
          <Settings size={18} className="text-slate-400 dark:text-slate-500" />
          {expanded && <span>Settings</span>}
        </Link>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors w-full dark:hover:bg-slate-800"
        >
          <LogOut size={18} className="text-slate-400 dark:text-slate-500" />
          {expanded && <span>Sign Out</span>}
        </button>
        {expanded && (
          <div className="flex items-center gap-3 px-3 pt-2 text-xs text-slate-400 dark:text-slate-500">
            <Link href="/privacy" className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors">Privacy</Link>
            <span>&middot;</span>
            <Link href="/terms" className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors">Terms</Link>
          </div>
        )}
      </div>

      {/* Collapse Toggle (desktop only) */}
      <button
        onClick={onToggle}
        className="hidden md:flex items-center justify-center py-2 border-t border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors dark:border-slate-700 dark:text-slate-500 dark:hover:bg-slate-800"
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
          "hidden md:flex fixed inset-y-0 left-0 z-40 flex-col bg-white border-r border-slate-200 transition-all duration-200 dark:bg-slate-900 dark:border-slate-700",
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
          <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 md:hidden dark:bg-slate-900 dark:border-slate-700">
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
                {!createTeamOrgId && orgsById && Object.keys(orgsById).length > 1 && (
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-slate-700">Organization</label>
                    <select
                      value={createTeamOrgId || ""}
                      onChange={(e) => setCreateTeamOrgId(e.target.value || null)}
                      className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      {Object.values(orgsById).map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
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

      {/* Create Org Modal */}
      {showCreateOrg && (
        <>
          <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setShowCreateOrg(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold text-slate-900">New Organization</h2>
                <button onClick={() => setShowCreateOrg(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={(e) => void handleCreateOrg(e)} className="space-y-4">
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-slate-700">Organization Name</label>
                  <input
                    autoFocus
                    type="text"
                    placeholder="e.g. Acme Corp"
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    required
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setShowCreateOrg(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                  <button type="submit" disabled={creatingOrg || !newOrgName.trim()} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    {creatingOrg ? "Creating..." : "Create Organization"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      {/* Delete Team Confirmation */}
      <Modal open={!!confirmDeleteTeam} onClose={() => setConfirmDeleteTeam(null)} title="Delete Team">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Are you sure you want to delete <strong>{confirmDeleteTeam?.name}</strong>? This will permanently remove the team, all its projects, tasks, and members.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDeleteTeam(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void handleDeleteTeam()}>
              Delete Team
            </Button>
          </div>
        </div>
      </Modal>

      {/* Org Settings Modal */}
      {orgSettings && (
        <OrgSettingsModal
          open={!!orgSettings}
          onClose={() => setOrgSettings(null)}
          orgId={orgSettings.orgId}
          orgName={orgSettings.orgName}
          onOrgUpdated={handleOrgUpdated}
        />
      )}
    </>
  );
}
