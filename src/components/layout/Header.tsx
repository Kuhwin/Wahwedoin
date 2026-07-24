"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Search, Menu, Sun, Moon, Settings, LogOut, ChevronDown, ArrowRightLeft } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import NotificationsBell from "@/components/NotificationsBell";
import SearchModal from "@/components/SearchModal";
import { useTheme } from "@/components/ui/ThemeProvider";
import { useActiveUser } from "@/components/ActiveUserProvider";

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { activeProfile, activeUserId, authUserId, orgMembers, isImpersonating, switchUser } = useActiveUser();
  const supabase = createClient();
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);

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
                    <button
                      onClick={() => void handleSignOut()}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
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
