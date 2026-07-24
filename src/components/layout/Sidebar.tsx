"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  CheckSquare,
  Calendar,
  Users,
  FolderKanban,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { User } from "@supabase/supabase-js";
import type { Team } from "@/lib/types";

interface SidebarProps {
  user: User;
  expanded: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidebar({ user, expanded, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTeam, setActiveTeam] = useState<Team | null>(null);

  useEffect(() => {
    async function loadTeams() {
      try {
        const { data: memberships, error } = await supabase
          .from("team_members")
          .select("team_id, teams(*)")
          .eq("user_id", user.id);

        if (error || !memberships) return;

        const teamList = (memberships as { teams: Team }[]).map((m) => m.teams).filter(Boolean);
        setTeams(teamList);
        if (teamList.length > 0 && !activeTeam) {
          setActiveTeam(teamList[0]);
        }
      } catch {
        // Table might not exist yet
      }
    }
    void loadTeams();
  }, [user.id, supabase]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  const navItems = [
    { href: "/", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/my-tasks", icon: CheckSquare, label: "My Tasks" },
    { href: "/calendar", icon: Calendar, label: "Calendar" },
    { href: "/teams", icon: Users, label: "Teams" },
    { href: "/projects", icon: FolderKanban, label: "Projects" },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-5 flex items-center justify-between border-b border-slate-200">
        {expanded && (
          <Link href="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">WD</span>
            </div>
            <span className="font-bold text-slate-900 text-sm">Wah We Doin</span>
          </Link>
        )}
        {!expanded && (
          <Link href="/" className="mx-auto">
            <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">WD</span>
            </div>
          </Link>
        )}
      </div>

      {/* Team Switcher */}
      {expanded && teams.length > 0 && (
        <div className="px-3 py-3 border-b border-slate-200">
          <select
            value={activeTeam?.id || ""}
            onChange={(e) => {
              const team = teams.find((t) => t.id === e.target.value);
              if (team) setActiveTeam(team);
            }}
            className="w-full text-sm font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onMobileClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <item.icon size={18} className={isActive ? "text-indigo-600" : "text-slate-400"} />
              {expanded && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-slate-200 space-y-1">
        <Link
          href="/settings"
          onClick={onMobileClose}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
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
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors w-full"
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
          <div className="fixed inset-0 z-50 bg-black/50 md:hidden" onClick={onMobileClose} />
          <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 md:hidden">
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  );
}
