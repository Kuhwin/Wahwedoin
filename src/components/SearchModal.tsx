"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Search, FolderKanban, CheckSquare, Calendar, Users, X, Loader2 } from "lucide-react";

interface SearchResult {
  type: "project" | "task" | "event" | "team" | "member";
  id: string;
  title: string;
  subtitle: string;
  link: string;
  icon: typeof FolderKanban;
  color: string;
}

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SearchModal({ open, onClose }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    const pattern = `%${q}%`;

    const [projectsRes, tasksRes, eventsRes, teamsRes, membersRes] = await Promise.all([
      supabase.from("projects").select("id, name, team_id").ilike("name", pattern).limit(5),
      supabase.from("tasks").select("id, title, project_id, status").ilike("title", pattern).limit(5),
      supabase.from("events").select("id, title, start_date").ilike("title", pattern).limit(5),
      supabase.from("teams").select("id, name").ilike("name", pattern).limit(5),
      supabase.from("user_profiles").select("user_id, display_name").ilike("display_name", pattern).limit(5),
    ]);

    const found: SearchResult[] = [];

    if (projectsRes.data) {
      for (const p of projectsRes.data) {
        found.push({ type: "project", id: p.id, title: p.name, subtitle: "Project", link: `/projects/${p.id}`, icon: FolderKanban, color: "text-indigo-500" });
      }
    }
    if (tasksRes.data) {
      for (const t of tasksRes.data) {
        found.push({ type: "task", id: t.id, title: t.title, subtitle: t.status, link: t.project_id ? `/projects/${t.project_id}` : "/my-tasks", icon: CheckSquare, color: "text-green-500" });
      }
    }
    if (eventsRes.data) {
      for (const e of eventsRes.data) {
        found.push({ type: "event", id: e.id, title: e.title, subtitle: new Date(e.start_date).toLocaleDateString("en-GB", { month: "short", day: "numeric" }), link: "/calendar", icon: Calendar, color: "text-amber-500" });
      }
    }
    if (teamsRes.data) {
      for (const t of teamsRes.data) {
        found.push({ type: "team", id: t.id, title: t.name, subtitle: "Team", link: `/teams/${t.id}`, icon: Users, color: "text-violet-500" });
      }
    }
    if (membersRes.data) {
      for (const m of membersRes.data) {
        found.push({ type: "member", id: m.user_id, title: m.display_name || "Unknown", subtitle: "Team member", link: "/settings", icon: Users, color: "text-green-500" });
      }
    }

    setResults(found);
    setSelectedIdx(0);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const timer = setTimeout(() => void search(query), 200);
    return () => clearTimeout(timer);
  }, [query, search]);

  function handleSelect(result: SearchResult) {
    onClose();
    router.push(result.link);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && results[selectedIdx]) { handleSelect(results[selectedIdx]); }
  }

  const hasResults = results.length > 0;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <Search size={18} className="text-slate-400 dark:text-slate-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search tasks, projects, events, teams, members..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
          />
          {loading && <Loader2 size={14} className="animate-spin text-slate-400" />}
          <kbd className="hidden sm:inline text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">ESC</kbd>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {query.length < 2 ? (
            <div className="p-6 text-center">
              <p className="text-sm text-slate-400 dark:text-slate-500">Type at least 2 characters to search</p>
              <div className="flex items-center justify-center gap-4 mt-3">
                <span className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500">
                  <kbd className="px-1 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-medium">↑↓</kbd> Navigate
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500">
                  <kbd className="px-1 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-medium">↵</kbd> Open
                </span>
              </div>
            </div>
          ) : !hasResults && !loading ? (
            <div className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : (
            <div className="py-2">
              {results.map((result, idx) => {
                const Icon = result.icon;
                return (
                  <button
                    key={`${result.type}-${result.id}`}
                    onClick={() => handleSelect(result)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      idx === selectedIdx ? "bg-indigo-50 dark:bg-indigo-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <Icon size={16} className={`${result.color} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{result.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">{result.subtitle}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
