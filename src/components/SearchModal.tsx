"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Search, FolderKanban, CheckSquare, Calendar, Users, X } from "lucide-react";
import { type Project, type Task, type Event, type Team } from "@/lib/types";

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SearchModal({ open, onClose }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setProjects([]);
      setTasks([]);
      setEvents([]);
      setTeams([]);
      return;
    }

    setLoading(true);
    const pattern = `%${q}%`;

    const [projectsRes, tasksRes, eventsRes, teamsRes] = await Promise.all([
      supabase.from("projects").select("*").ilike("name", pattern).limit(5),
      supabase.from("tasks").select("*").ilike("title", pattern).limit(5),
      supabase.from("events").select("*").ilike("title", pattern).limit(5),
      supabase.from("teams").select("*").ilike("name", pattern).limit(5),
    ]);

    if (projectsRes.data) setProjects(projectsRes.data);
    if (tasksRes.data) setTasks(tasksRes.data);
    if (eventsRes.data) setEvents(eventsRes.data);
    if (teamsRes.data) setTeams(teamsRes.data);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setProjects([]);
      setTasks([]);
      setEvents([]);
      setTeams([]);
    }
  }, [open]);

  const hasResults = projects.length > 0 || tasks.length > 0 || events.length > 0 || teams.length > 0;

  function navigate(path: string) {
    onClose();
    router.push(path);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
          <Search size={18} className="text-slate-400 shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="Search projects, tasks, events, teams..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
          />
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto">
          {!query.trim() ? (
            <div className="p-6 text-center text-sm text-slate-400">
              Type to search across your workspace
            </div>
          ) : loading ? (
            <div className="p-6 text-center">
              <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin mx-auto" />
            </div>
          ) : !hasResults ? (
            <div className="p-6 text-center text-sm text-slate-400">
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : (
            <div className="py-2">
              {projects.length > 0 && (
                <div>
                  <div className="px-4 py-1 text-[10px] font-medium text-slate-400 uppercase">Projects</div>
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => navigate(`/projects/${p.id}`)}
                      className="flex items-center gap-3 w-full px-4 py-2 hover:bg-slate-50 text-left"
                    >
                      <FolderKanban size={16} className="text-indigo-500 shrink-0" />
                      <span className="text-sm text-slate-700 truncate">{p.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {tasks.length > 0 && (
                <div>
                  <div className="px-4 py-1 text-[10px] font-medium text-slate-400 uppercase">Tasks</div>
                  {tasks.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => navigate(`/projects/${t.project_id}`)}
                      className="flex items-center gap-3 w-full px-4 py-2 hover:bg-slate-50 text-left"
                    >
                      <CheckSquare size={16} className="text-green-500 shrink-0" />
                      <span className="text-sm text-slate-700 truncate">{t.title}</span>
                    </button>
                  ))}
                </div>
              )}
              {events.length > 0 && (
                <div>
                  <div className="px-4 py-1 text-[10px] font-medium text-slate-400 uppercase">Events</div>
                  {events.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => navigate("/calendar")}
                      className="flex items-center gap-3 w-full px-4 py-2 hover:bg-slate-50 text-left"
                    >
                      <Calendar size={16} className="text-amber-500 shrink-0" />
                      <span className="text-sm text-slate-700 truncate">{e.title}</span>
                    </button>
                  ))}
                </div>
              )}
              {teams.length > 0 && (
                <div>
                  <div className="px-4 py-1 text-[10px] font-medium text-slate-400 uppercase">Teams</div>
                  {teams.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => navigate(`/teams/${t.id}`)}
                      className="flex items-center gap-3 w-full px-4 py-2 hover:bg-slate-50 text-left"
                    >
                      <Users size={16} className="text-violet-500 shrink-0" />
                      <span className="text-sm text-slate-700 truncate">{t.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
