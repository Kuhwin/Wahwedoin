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
  Plus,
  FolderOpen,
  Mail,
  Users,
  Inbox,
  Briefcase,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
  const [orgsById, setOrgsById] = useState<Record<string, { id: string; name: string; slug: string }>>({});
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const [quickAddProjectId, setQuickAddProjectId] = useState("");
  const [quickAddLoading, setQuickAddLoading] = useState(false);
  function handleOrgUpdated(orgId?: string, newName?: string) {
    if (orgId && newName) {
      setOrgsById((prev) => {
        const existing = prev[orgId];
        if (!existing) return prev;
        return { ...prev, [orgId]: { ...existing, name: newName } };
      });
    }
    void loadData();
  }

  const loadData = useCallback(async () => {
    try {
      const { data: memberships, error } = await supabase
        .from("team_members")
        .select("team_id, teams(id, name, description, created_at, org_id)")
        .eq("user_id", user.id);

      if (error || !memberships) return;

      const teamList = (memberships as { teams: Team }[])
        .map((m) => m.teams)
        .filter(Boolean);

      const orgIds = [...new Set(teamList.map((t) => t.org_id).filter(Boolean))] as string[];
      if (orgIds.length > 0) {
        const { data: orgs } = await supabase
          .from("organizations")
          .select("id, name, slug")
          .in("id", orgIds);
        if (orgs?.length) {
          const orgMap: Record<string, { id: string; name: string; slug: string }> = {};
          orgs.forEach((o: { id: string; name: string; slug: string }) => { orgMap[o.id] = o; });
          setOrgsById(orgMap);
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

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  const navItems = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/my-tasks", icon: CheckSquare, label: "My Tasks" },
    { href: "/calendar", icon: Calendar, label: "Calendar" },
    { href: "/drive", icon: FolderOpen, label: "Drive" },
    { href: "/gmail", icon: Mail, label: "Gmail" },
    { href: "/inbox", icon: Inbox, label: "Inbox" },
    { href: "/teams", icon: Users, label: "Teams" },
    { href: "/manage", icon: Building2, label: "Manage" },
    { href: "/portfolios", icon: Briefcase, label: "Portfolios" },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-4 flex items-center justify-between">
        {expanded ? (
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo.png" alt="Wah We Doin" className="h-7 w-7 rounded-md object-cover" />
            <span className="font-bold text-slate-900 text-sm tracking-tight dark:text-slate-100">
              Wah We Doin
            </span>
          </Link>
        ) : (
          <Link href="/" className="mx-auto">
            <img src="/logo.png" alt="Wah We Doin" className="h-7 w-7 rounded-md object-cover" />
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

      <div className="flex-1" />

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

    </>
  );
}
