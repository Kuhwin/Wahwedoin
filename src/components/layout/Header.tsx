"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Search, Menu, Sun, Moon, Settings, LogOut, ChevronDown, Palette, Link2 } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import NotificationsBell from "@/components/NotificationsBell";
import SearchModal from "@/components/SearchModal";
import { useTheme } from "@/components/ui/ThemeProvider";
import { useAccentColour } from "@/components/AccentColourProvider";
import { useActiveUser } from "@/components/ActiveUserProvider";
import type { LinkedGoogleAccount } from "@/lib/types";

const isUUID = (s: string) => /^[0-9a-f]{8}-/i.test(s);

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [linkedGoogle, setLinkedGoogle] = useState<LinkedGoogleAccount[]>([]);
  const { theme, toggleTheme } = useTheme();
  const { accent, setAccent, presets } = useAccentColour();
  const { activeProfile } = useActiveUser();
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();
  const dropdownRef = useRef<HTMLDivElement>(null);
  // Resolved names for the current breadcrumb segments that are UUIDs
  // (e.g. /teams/<id> resolves the id to Org + Team names; /projects/<id>
  // resolves to Team + Project names). Null while loading.
  const [crumbResolve, setCrumbResolve] = useState<{
    orgName?: string;
    orgId?: string;
    teamName?: string;
    teamId?: string;
    projectName?: string;
  } | null>(null);

  useEffect(() => {
    async function loadGoogle() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("user_google_accounts")
        .select("id, email, display_name, avatar_url, color, scope")
        .eq("user_id", user.id);
      if (data) setLinkedGoogle(data as LinkedGoogleAccount[]);
    }
    void loadGoogle();
  }, [supabase]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setSearchOpen(true);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Resolve the breadcrumb segments that are UUIDs into real names so the
  // header shows "Org / Team" on team pages and "Team / Project" on
  // project pages, instead of the generic "Teams / Team" / "Projects /
  // Project" placeholders.
  useEffect(() => {
    const segs = pathname.split("/").filter(Boolean);
    const teamIdx = segs.findIndex((s, i) => isUUID(s) && segs[i - 1] === "teams");
    const projIdx = segs.findIndex((s, i) => isUUID(s) && segs[i - 1] === "projects");
    const teamId = teamIdx >= 0 ? segs[teamIdx] : null;
    const projectId = projIdx >= 0 ? segs[projIdx] : null;

    // If the path has neither a team nor a project UUID, clear resolve.
    if (!teamId && !projectId) {
      setCrumbResolve(null);
      return;
    }

    let cancelled = false;
    async function load() {
      try {
        if (projectId) {
          const { data: p } = await supabase
            .from("projects")
            .select("name, team_id, teams(name, org_id)")
            .eq("id", projectId)
            .maybeSingle();
          if (cancelled) return;
          // supabase returns the embedded to-one as an object; guard
          // against the array form just in case.
          const team = (p && (Array.isArray((p as { teams: unknown }).teams)
            ? (p as { teams: { name: string; org_id: string | null; id: string }[] }).teams[0]
            : (p as { teams: { name: string; org_id: string | null; id: string } | null }).teams)) || null;
          if (!p || !team) {
            setCrumbResolve(null);
            return;
          }
          let orgName: string | undefined;
          let orgId: string | undefined;
          if (team.org_id) {
            const { data: o } = await supabase
              .from("organizations")
              .select("id, name")
              .eq("id", team.org_id)
              .maybeSingle();
            if (cancelled) return;
            orgName = o?.name;
            orgId = o?.id;
          }
          if (cancelled) return;
          setCrumbResolve({
            orgName,
            orgId,
            teamName: team.name,
            teamId: team.id,
            projectName: (p as { name: string }).name,
          });
        } else if (teamId) {
          const { data: t } = await supabase
            .from("teams")
            .select("name, org_id")
            .eq("id", teamId)
            .maybeSingle();
          if (cancelled) return;
          if (!t) {
            setCrumbResolve(null);
            return;
          }
          let orgName: string | undefined;
          let orgId: string | undefined;
          if ((t as { org_id: string | null }).org_id) {
            const { data: o } = await supabase
              .from("organizations")
              .select("id, name")
              .eq("id", (t as { org_id: string }).org_id)
              .maybeSingle();
            if (cancelled) return;
            orgName = o?.name;
            orgId = o?.id;
          }
          if (cancelled) return;
          setCrumbResolve({
            orgName,
            orgId,
            teamName: (t as { name: string }).name,
            teamId,
          });
        }
      } catch {
        if (!cancelled) setCrumbResolve(null);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [pathname, supabase]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    localStorage.removeItem("wahwedoin-active-user");
    router.push("/auth/login");
  }
  void handleSignOut;

  const routeMap: Record<string, string> = {
    calendar: "Calendar",
    "my-tasks": "My Tasks",
    drive: "Drive",
    gmail: "Gmail",
    inbox: "Inbox",
    teams: "Teams",
    projects: "Projects",
    "all-projects": "All Projects",
    settings: "Settings",
    portfolios: "Portfolios",
    goals: "Goals",
    import: "Import",
    appearance: "Appearance",
    privacy: "Privacy",
    terms: "Terms",
  };

  const breadcrumbs: { label: string; href: string | null }[] = (() => {
    if (pathname === "/") return [];
    const segments = pathname.split("/").filter(Boolean);
    const crumbs: { label: string; href: string | null }[] = [];

    // /teams/<uuid>: show "<Org Name> / <Team Name>" (user preference:
    // org then team, not the generic "Teams / Team").
    const teamSegIdx = segments.findIndex((s, i) => isUUID(s) && segments[i - 1] === "teams");
    if (teamSegIdx >= 0 && crumbResolve?.teamName) {
      if (crumbResolve.orgName) {
        crumbs.push({
          label: crumbResolve.orgName,
          href: crumbResolve.orgId ? `/manage?org=${crumbResolve.orgId}` : null,
        });
      } else {
        crumbs.push({ label: "Teams", href: "/teams" });
      }
      crumbs.push({ label: crumbResolve.teamName, href: null });
      return crumbs;
    }

    // /projects/<uuid>: show "<Team Name> / <Project Name>".
    const projSegIdx = segments.findIndex((s, i) => isUUID(s) && segments[i - 1] === "projects");
    if (projSegIdx >= 0 && crumbResolve?.projectName) {
      if (crumbResolve.teamName) {
        crumbs.push({
          label: crumbResolve.teamName,
          href: crumbResolve.teamId ? `/teams/${crumbResolve.teamId}` : null,
        });
      } else {
        crumbs.push({ label: "Projects", href: "/all-projects" });
      }
      crumbs.push({ label: crumbResolve.projectName, href: null });
      return crumbs;
    }

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const isLast = i === segments.length - 1;
      const path = "/" + segments.slice(0, i + 1).join("/");

      if (isUUID(seg)) {
        const parent = segments[i - 1];
        const label = parent === "teams" ? "Team" : parent === "projects" ? "Project" : seg;
        crumbs.push({ label, href: isLast ? null : path });
      } else if (seg === "import" && segments[i - 1] === "settings") {
        crumbs.push({ label: "Import", href: isLast ? null : path });
      } else if (seg === "appearance" && segments[i - 1] === "settings") {
        crumbs.push({ label: "Appearance", href: isLast ? null : path });
      } else {
        const label = routeMap[seg] || seg.charAt(0).toUpperCase() + seg.slice(1);
        crumbs.push({ label, href: isLast ? null : path });
      }
    }

    return crumbs;
  })();

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between h-14 px-4 md:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={onMenuClick}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-slate-800 md:hidden"
            >
              <Menu size={20} />
            </button>
            {breadcrumbs.length > 0 && (
              <div className="hidden md:flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                {breadcrumbs.map((crumb, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-slate-300 dark:text-slate-600">/</span>}
                    {crumb.href ? (
                      <Link href={crumb.href} className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">{crumb.label}</Link>
                    ) : (
                      <span className="text-slate-700 dark:text-slate-300 font-medium">{crumb.label}</span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <Search size={14} />
              <span className="hidden sm:inline">Search...</span>
              <kbd className="hidden sm:inline text-[10px] font-mono bg-slate-200 dark:bg-slate-600 px-1.5 py-0.5 rounded">
                Ctrl+K
              </kbd>
            </button>

            <NotificationsBell />

            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-1 p-0.5 rounded-full hover:ring-2 hover:ring-indigo-200 dark:hover:ring-indigo-800 transition-all"
              >
                <Avatar
                  name={activeProfile?.display_name || undefined}
                  email={activeProfile?.user_email || ""}
                  avatarUrl={activeProfile?.avatar_url || undefined}
                  size="sm"
                />
                <ChevronDown size={12} className="text-slate-400 dark:text-slate-500 hidden sm:block" />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="p-3 border-b border-slate-100 dark:border-slate-700">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {activeProfile?.display_name || "Unknown"}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {activeProfile?.user_email || "No email"}
                    </p>
                  </div>

                  <div className="p-1">
                    <button
                      onClick={() => { setDropdownOpen(false); router.push("/settings"); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      <Settings size={15} className="text-slate-400 dark:text-slate-500" />
                      Settings
                    </button>

                    <button
                      onClick={() => { setDropdownOpen(false); toggleTheme(); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      {theme === "dark" ? (
                        <Sun size={15} className="text-slate-400 dark:text-slate-500" />
                      ) : (
                        <Moon size={15} className="text-slate-400 dark:text-slate-500" />
                      )}
                      {theme === "dark" ? "Light mode" : "Dark mode"}
                    </button>

                    <div className="px-3 py-2">
                      <div className="flex items-center gap-2 mb-2">
                        <Palette size={15} className="text-slate-400 dark:text-slate-500" />
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Accent</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {presets.map((c) => (
                          <button
                            key={c}
                            onClick={() => setAccent(c)}
                            className={`w-5 h-5 rounded-full border-2 transition-all ${accent === c ? "border-slate-900 dark:border-white scale-110" : "border-transparent hover:scale-110"}`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="p-1 border-t border-slate-100 dark:border-slate-700">
                    {linkedGoogle.length > 0 && (
                      <>
                        <div className="px-3 py-1.5">
                          <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1">
                            <Link2 size={10} />
                            Linked Accounts
                          </p>
                        </div>
                        {linkedGoogle.map((acc) => (
                          <div key={acc.id} className="flex items-center gap-2.5 px-3 py-1.5">
                            <div className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0" style={{ backgroundColor: acc.color || "#6366f1" }}>
                              {acc.email.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-xs text-slate-600 dark:text-slate-400 truncate">
                              {acc.display_label ? `${acc.display_label} — ${acc.email}` : acc.email}
                            </span>
                          </div>
                        ))}
                        <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
                      </>
                    )}
                    <button
                      onClick={() => { setDropdownOpen(false); router.push("/settings"); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      <LogOut size={15} />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
