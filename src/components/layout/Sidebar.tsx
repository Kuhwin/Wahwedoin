"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Home,
  CheckSquare,
  Inbox,
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
import { cn } from "@/lib/utils";
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
  const [inboxCount, setInboxCount] = useState(0);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const [quickAddLoading, setQuickAddLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const { data: memberships, error } = await supabase
        .from("team_members")
        .select("team_id, teams(*)")
        .eq("user_id", user.id);

      if (error || !memberships) return;

      const teamList = (memberships as { teams: Team }[])
        .map((m) => m.teams)
        .filter(Boolean);

      const teamsWithProjects: TeamWithProjects[] = await Promise.all(
        teamList.map(async (team) => {
          const { data: projects } = await supabase
            .from("projects")
            .select("*")
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

  const loadInboxCount = useCallback(async () => {
    try {
      const { count } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("assignee_id", user.id)
        .neq("status", "done");

      setInboxCount(count ?? 0);
    } catch {
      // Table might not exist yet
    }
  }, [supabase, user.id]);

  useEffect(() => {
    void loadData();
    void loadInboxCount();
  }, [loadData, loadInboxCount]);

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
    if (!quickAddTitle.trim()) return;
    setQuickAddLoading(true);

    try {
      const { error } = await supabase.from("tasks").insert({
        title: quickAddTitle.trim(),
        assignee_id: user.id,
        created_by: user.id,
        status: "todo",
        priority: "medium",
        position: 0,
      });

      if (!error) {
        setQuickAddTitle("");
        setShowQuickAdd(false);
        void loadInboxCount();
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
    { href: "/inbox", icon: Inbox, label: "Inbox", badge: inboxCount },
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
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">
              <input
                autoFocus
                type="text"
                placeholder="Task name"
                value={quickAddTitle}
                onChange={(e) => setQuickAddTitle(e.target.value)}
                onKeyDown={handleQuickAddKeyDown}
                className="flex-1 bg-transparent text-sm text-slate-900 placeholder-slate-400 outline-none"
              />
              <button
                onClick={() => void handleQuickAdd()}
                disabled={quickAddLoading || !quickAddTitle.trim()}
                className={cn(
                  "p-1 rounded-md transition-colors",
                  quickAddTitle.trim()
                    ? "text-indigo-600 hover:bg-indigo-50"
                    : "text-slate-300"
                )}
              >
                <Send size={14} />
              </button>
              <button
                onClick={() => {
                  setShowQuickAdd(false);
                  setQuickAddTitle("");
                }}
                className="p-1 rounded-md text-slate-400 hover:bg-slate-100 transition-colors"
              >
                <X size={14} />
              </button>
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
              {expanded && (
                <>
                  <span className="flex-1">{item.label}</span>
                  {"badge" in item &&
                    typeof item.badge === "number" &&
                    item.badge > 0 && (
                      <span className="min-w-[20px] h-5 flex items-center justify-center rounded-full bg-indigo-600 text-white text-[11px] font-semibold px-1.5">
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    )}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Teams Section */}
      {teams.length > 0 && (
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {expanded && (
            <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Teams
            </div>
          )}

          <div className="space-y-0.5">
            {teams.map((team) => {
              const isTeamExpanded = expandedTeams.has(team.id);
              return (
                <div key={team.id}>
                  <button
                    onClick={() => toggleTeam(team.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                      "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    )}
                  >
                    {expanded ? (
                      <>
                        {isTeamExpanded ? (
                          <ChevronDown
                            size={14}
                            className="text-slate-400 shrink-0"
                          />
                        ) : (
                          <ChevronRightIcon
                            size={14}
                            className="text-slate-400 shrink-0"
                          />
                        )}
                        <span className="flex-1 text-left truncate">
                          {team.name}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {team.projects.length}
                        </span>
                      </>
                    ) : (
                      <div
                        className="h-6 w-6 rounded-md bg-slate-200 flex items-center justify-center mx-auto"
                        title={team.name}
                      >
                        <span className="text-[10px] font-semibold text-slate-600">
                          {team.name.slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </button>

                  {/* Projects under team */}
                  {expanded && isTeamExpanded && team.projects.length > 0 && (
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
                    </div>
                  )}

                  {expanded && isTeamExpanded && team.projects.length === 0 && (
                    <div className="ml-5 pl-3 border-l border-slate-100 pb-1">
                      <span className="text-xs text-slate-400 italic px-2 py-1 block">
                        No projects yet
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Spacer when no teams */}
      {teams.length === 0 && <div className="flex-1" />}

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
    </>
  );
}
