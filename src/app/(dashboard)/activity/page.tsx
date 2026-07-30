"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Activity, Loader2 } from "lucide-react";
import type { Activity as ActivityType } from "@/lib/types";
import { formatRelativeTime } from "@/lib/utils";
import Button from "@/components/ui/Button";

const PER_PAGE = 30;

export default function ActivityPage() {
  const supabase = createClient();
  const router = useRouter();
  const [activities, setActivities] = useState<ActivityType[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [filterAction, setFilterAction] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  const uniqueActions = [...new Set(activities.map((a) => a.action))].sort();

  const filtered = activities.filter((a) => {
    if (filterAction && a.action !== filterAction) return false;
    if (filterProject && a.project_id !== filterProject) return false;
    return true;
  });

  const loadActivities = useCallback(async (pageNum: number, reset: boolean) => {
    (reset ? setLoading : setLoadingMore)(true);
    const from = pageNum * PER_PAGE;
    const to = from + PER_PAGE - 1;

    const { data } = await supabase
      .from("activities")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (data) {
      if (data.length < PER_PAGE) setHasMore(false);
      setActivities((prev) => (reset ? data : [...prev, ...data]));

      const userIds = [...new Set(data.map((a: ActivityType) => a.user_id).filter(Boolean))];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("user_profiles")
          .select("user_id, display_name")
          .in("user_id", userIds);
        if (profiles) {
          const map: Record<string, string> = {};
          profiles.forEach((p: { user_id: string; display_name: string }) => { map[p.user_id] = p.display_name; });
          setUserNames((prev) => ({ ...prev, ...map }));
        }
      }
    }
    (reset ? setLoading : setLoadingMore)(false);
  }, [supabase]);

  useEffect(() => {
    void loadActivities(0, true);
    supabase
      .from("projects")
      .select("id, name")
      .then((res: { data: { id: string; name: string }[] | null; error: unknown }) => {
        if (res.data) setProjects(res.data);
      });
  }, [loadActivities, supabase]);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" onClick={() => router.back()}>
          ← Back
        </Button>
        <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
          <Activity size={18} />
          Activity Log
        </h1>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl">
        <div className="flex items-center gap-2 p-4 pb-0 flex-wrap">
          <select
            value={filterAction}
            onChange={(e) => { setFilterAction(e.target.value); setPage(0); }}
            className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-accent/50"
          >
            <option value="">All actions</option>
            {uniqueActions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <select
            value={filterProject}
            onChange={(e) => { setFilterProject(e.target.value); setPage(0); }}
            className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-accent/50"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {(filterAction || filterProject) && (
            <button
              onClick={() => { setFilterAction(""); setFilterProject(""); }}
              className="text-xs text-accent hover:text-indigo-700 font-medium"
            >
              Clear
            </button>
          )}
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-700/50 p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-slate-400" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No activity yet</p>
          ) : (
            <>
              {filtered.map((act) => (
                <div key={act.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    <span className="font-medium">{userNames[act.user_id] || "Someone"}</span>
                    {" "}{act.action}
                    {act.detail && <span className="font-medium"> {act.detail}</span>}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    {formatRelativeTime(act.created_at)}
                  </p>
                </div>
              ))}
              {hasMore && (
                <button
                  onClick={() => { const next = page + 1; setPage(next); void loadActivities(next, false); }}
                  disabled={loadingMore}
                  className="w-full py-3 text-sm font-medium text-accent hover:bg-accent/10 transition-colors flex items-center justify-center gap-1"
                >
                  {loadingMore ? <Loader2 size={14} className="animate-spin" /> : "Load more"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
