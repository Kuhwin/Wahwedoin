"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Search, Menu, Sun, Moon, Settings, LogOut, ChevronDown, ArrowRightLeft, Palette, Link2 } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import NotificationsBell from "@/components/NotificationsBell";
import SearchModal from "@/components/SearchModal";
import { useTheme } from "@/components/ui/ThemeProvider";
import { useAccentColour } from "@/components/AccentColourProvider";
import { useActiveUser } from "@/components/ActiveUserProvider";
import type { LinkedGoogleAccount } from "@/lib/types";

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [linkedGoogle, setLinkedGoogle] = useState<LinkedGoogleAccount[]>([]);
  const { theme, toggleTheme } = useTheme();
  const { accent, setAccent, presets } = useAccentColour();
  const { activeProfile, activeUserId, authUserId, orgMembers, isImpersonating, switchUser } = useActiveUser();
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  async function handleSignOut() {
    await supabase.auth.signOut();
    localStorage.removeItem("wahwedoin-active-user");
    router.push("/auth/login");
  }

  const otherMembers = orgMembers.filter((m) => m.user_id !== activeUserId);

  const routeMap: Record<string, string> = {
    calendar: "Calendar",
    "my-tasks": "My Tasks",
    drive: "Drive",
    gmail: "Gmail",
    inbox: "Inbox",
    teams: "Teams",
    projects: "Projects",
    settings: "Settings",
    portfolios: "Portfolios",
    import: "Import",
    appearance: "Appearance",
    privacy: "Privacy",
    terms: "Terms",
  };

  const isUUID = (s: string) => /^[0-9a-f]{8}-/i.test(s);

  const breadcrumbs: { label: string; href: string | null }[] = (() => {
    if (pathname === "/") return [];
    const segments = pathname.split("/").filter(Boolean);
    const crumbs: { label: string; href: string | null }[] = [];

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
        {isImpersonating && (
          <div className="bg-amber-500 text-white text-xs text-center py-1 px-4 flex items-center justify-center gap-2">
            <ArrowRightLeft size={12} />
            Acting as <strong>{activeProfile?.display_name || activeProfile?.user_email || "Unknown"}</strong>
            <button onClick={() => switchUser(authUserId!)} className="underline hover:no-underline ml-1 font-medium">
              Switch back
            </button>
          </div>
        )}
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
                    {isImpersonating && (
                      <span className="inline-block mt-1 text-[10px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded">
                        Impersonating
                      </span>
                    )}
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

                    {otherMembers.length > 0 && (
                      <>
                        <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
                        <div className="px-3 py-1.5">
                          <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                            Switch User
                          </p>
                        </div>
                        {otherMembers.map((member) => (
                          <button
                            key={member.user_id}
                            onClick={() => { switchUser(member.user_id); setDropdownOpen(false); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                          >
                            <Avatar
                              name={member.display_name || undefined}
                              email={member.user_email}
                              avatarUrl={member.avatar_url || undefined}
                              size="xs"
                            />
                            <span className="truncate">{member.display_name || member.user_email || "Unknown"}</span>
                          </button>
                        ))}
                      </>
                    )}
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
                              {(acc.display_name || acc.email).charAt(0).toUpperCase()}
                            </div>
                            <span className="text-xs text-slate-600 dark:text-slate-400 truncate">
                              {acc.display_label || acc.display_name || acc.email.split("@")[0]}
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
