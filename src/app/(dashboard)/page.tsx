"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  FolderKanban,
  CheckSquare,
  Calendar,
  ArrowRight,
  Clock,
  AlertCircle,
  CheckCircle2,
  Activity,
  Flag,
  TrendingUp,
  ChevronRight,
  Loader2,
} from "lucide-react";
import type { Project, Task, Activity as ActivityType } from "@/lib/types";
import { PRIORITY_CONFIG, type ViewMode } from "@/lib/types";
import { checkDueDateNotifications } from "@/lib/dueDateChecker";
import Modal from "@/components/ui/Modal";

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activities, setActivities] = useState<ActivityType[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [allActivities, setAllActivities] = useState<ActivityType[]>([]);
  const [allUserNames, setAllUserNames] = useState<Record<string, string>>({});
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [activitiesPage, setActivitiesPage] = useState(0);
  const [hasMoreActivities, setHasMoreActivities] = useState(true);
  const supabase = createClient();
  const ACTIVITIES_PER_PAGE = 20;

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const [projectsRes, tasksRes, actRes] = await Promise.all([
          supabase
            .from("projects")
            .select("id, name, team_id, status, created_at")
            .order("created_at", { ascending: false }),
          supabase
            .from("tasks")
            .select("id, project_id, title, status, priority, due_date, position, created_at")
            .order("created_at", { ascending: false }),
          supabase
            .from("activities")
            .select("id, user_id, action, detail, created_at")
            .order("created_at", { ascending: false })
            .limit(7),
        ]);

        if (projectsRes.data) setProjects(projectsRes.data as Project[]);
        if (tasksRes.data) setTasks(tasksRes.data as Task[]);

        if (actRes.data) {
          setActivities(actRes.data as ActivityType[]);
          const userIds = [...new Set(actRes.data.map((a: ActivityType) => a.user_id).filter(Boolean))];
          if (userIds.length > 0) {
            const { data: profiles } = await supabase
              .from("user_profiles")
              .select("user_id, display_name")
              .in("user_id", userIds);
            if (profiles) {
              const map: Record<string, string> = {};
              profiles.forEach((p: { user_id: string; display_name: string }) => { map[p.user_id] = p.display_name; });
              setUserNames(map);
            }
          }
        }

        void checkDueDateNotifications();
      } catch {
        // Tables might not exist yet
      }
      setLoading(false);
    }
    void load();
  }, [supabase]);

  const loadAllActivities = useCallback(async (page: number, reset: boolean) => {
    setActivitiesLoading(true);
    const from = page * ACTIVITIES_PER_PAGE;
    const to = from + ACTIVITIES_PER_PAGE - 1;

    const { data } = await supabase
      .from("activities")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (data) {
      if (data.length < ACTIVITIES_PER_PAGE) setHasMoreActivities(false);
      setAllActivities((prev) => (reset ? data : [...prev, ...data]));
      const userIds = [...new Set(data.map((a: ActivityType) => a.user_id).filter(Boolean))];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("user_profiles")
          .select("user_id, display_name")
          .in("user_id", userIds);
        if (profiles) {
          const map: Record<string, string> = {};
          profiles.forEach((p: { user_id: string; display_name: string }) => { map[p.user_id] = p.display_name; });
          setAllUserNames((prev) => ({ ...prev, ...map }));
        }
      }
    }
    setActivitiesLoading(false);
  }, [supabase]);

  function handleOpenAllActivities() {
    setShowAllActivities(true);
    setActivitiesPage(0);
    setHasMoreActivities(true);
    setAllActivities([]);
    void loadAllActivities(0, true);
  }

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const activeTasks = tasks.filter((t) => t.status === "in_progress").length;
  const todoTasks = tasks.filter((t) => t.status === "todo").length;
  const today = new Date().toISOString().split("T")[0];
  const overdueTasks = tasks.filter((t) => t.due_date && t.due_date < today && t.status !== "done");
  const dueToday = tasks.filter((t) => t.due_date === today && t.status !== "done");
  const dueSoon = tasks.filter((t) => {
    if (!t.due_date || t.status === "done") return false;
    const diff = new Date(t.due_date).getTime() - new Date(today).getTime();
    return diff > 0 && diff <= 3 * 86400000;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Overview of all your projects and tasks</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <FolderKanban size={16} className="text-indigo-600" />
            <span className="text-xs font-medium text-slate-500">Projects</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{projects.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={16} className="text-green-600" />
            <span className="text-xs font-medium text-slate-500">Done</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {doneTasks}<span className="text-sm text-slate-400 font-normal">/{totalTasks}</span>
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={16} className="text-blue-600" />
            <span className="text-xs font-medium text-slate-500">In Progress</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{activeTasks}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Flag size={16} className="text-slate-500" />
            <span className="text-xs font-medium text-slate-500">To Do</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{todoTasks}</p>
        </div>
        <div className={`bg-white border rounded-xl p-4 ${overdueTasks.length > 0 ? "border-red-200 bg-red-50" : "border-slate-200"}`}>
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={16} className="text-red-600" />
            <span className="text-xs font-medium text-slate-500">Overdue</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{overdueTasks.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Overdue / Due Soon Alerts */}
        <div className="lg:col-span-2 space-y-4">
          {overdueTasks.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-red-700 mb-3 flex items-center gap-2">
                <AlertCircle size={14} />
                Overdue Tasks ({overdueTasks.length})
              </h3>
              <div className="space-y-1.5">
                {overdueTasks.slice(0, 5).map((task) => (
                  <div key={task.id} className="flex items-center justify-between p-2 bg-white rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${PRIORITY_CONFIG[task.priority].color}`}>
                        {task.priority}
                      </span>
                      <span className="text-sm text-slate-700 truncate">{task.title}</span>
                    </div>
                    <span className="text-xs text-red-500 shrink-0 ml-2">{task.due_date}</span>
                  </div>
                ))}
                {overdueTasks.length > 5 && (
                  <Link href="/my-tasks" className="block text-center text-xs text-red-600 hover:text-red-700 pt-1">
                    +{overdueTasks.length - 5} more
                  </Link>
                )}
              </div>
            </div>
          )}

          {dueToday.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-amber-700 mb-3 flex items-center gap-2">
                <Clock size={14} />
                Due Today ({dueToday.length})
              </h3>
              <div className="space-y-1.5">
                {dueToday.map((task) => (
                  <div key={task.id} className="flex items-center justify-between p-2 bg-white rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${PRIORITY_CONFIG[task.priority].color}`}>
                        {task.priority}
                      </span>
                      <span className="text-sm text-slate-700 truncate">{task.title}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {dueSoon.length > 0 && overdueTasks.length === 0 && dueToday.length === 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-blue-700 mb-3 flex items-center gap-2">
                <Clock size={14} />
                Due Soon ({dueSoon.length})
              </h3>
              <div className="space-y-1.5">
                {dueSoon.slice(0, 5).map((task) => (
                  <div key={task.id} className="flex items-center justify-between p-2 bg-white rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${PRIORITY_CONFIG[task.priority].color}`}>
                        {task.priority}
                      </span>
                      <span className="text-sm text-slate-700 truncate">{task.title}</span>
                    </div>
                    <span className="text-xs text-blue-500 shrink-0 ml-2">{task.due_date}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Project Progress */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <TrendingUp size={14} />
                Project Progress
              </h2>
              <Link href="/projects" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
                View all
              </Link>
            </div>
            {projects.length === 0 ? (
              <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-6 text-center">
                No projects yet
              </p>
            ) : (
              <div className="space-y-2">
                {projects.slice(0, 6).map((project) => {
                  const projectTasks = tasks.filter((t) => t.project_id === project.id);
                  const completed = projectTasks.filter((t) => t.status === "done").length;
                  const total = projectTasks.length;
                  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

                  return (
                    <Link
                      key={project.id}
                      href={`/projects/${project.id}`}
                      className="flex items-center gap-4 p-3 bg-white border border-slate-200 rounded-xl hover:border-indigo-300 hover:shadow-sm transition-all"
                    >
                      <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-medium text-slate-900 truncate">{project.name}</p>
                          <span className="text-xs text-slate-400 shrink-0 ml-2">{completed}/{total}</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: project.color }}
                          />
                        </div>
                      </div>
                      <span className="text-xs text-slate-400 w-8 text-right shrink-0">{pct}%</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Activity Feed */}
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Activity size={14} />
            Recent Activity
          </h2>
          <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
            {activities.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">No activity yet</p>
            ) : (
              <>
                {activities.map((act) => (
                  <div key={act.id} className="p-3">
                    <p className="text-sm text-slate-700">
                      <span className="font-medium">{userNames[act.user_id] || "Someone"}</span>
                      {" "}{act.action}
                      {act.detail && <span className="font-medium"> {act.detail}</span>}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {formatRelativeTime(act.created_at)}
                    </p>
                  </div>
                ))}
                <button
                  onClick={handleOpenAllActivities}
                  className="w-full p-3 text-sm font-medium text-indigo-600 hover:bg-indigo-50 transition-colors flex items-center justify-center gap-1"
                >
                  View all activity <ChevronRight size={14} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Full Activity Modal */}
      <Modal open={showAllActivities} onClose={() => setShowAllActivities(false)} title="All Activity">
        <div className="max-h-[60vh] overflow-y-auto">
          {allActivities.length === 0 && activitiesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-slate-400" />
            </div>
          ) : allActivities.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">No activity yet</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {allActivities.map((act) => (
                <div key={act.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-sm text-slate-700">
                    <span className="font-medium">{allUserNames[act.user_id] || userNames[act.user_id] || "Someone"}</span>
                    {" "}{act.action}
                    {act.detail && <span className="font-medium"> {act.detail}</span>}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {formatRelativeTime(act.created_at)}
                  </p>
                </div>
              ))}
              {hasMoreActivities && (
                <button
                  onClick={() => { setActivitiesPage((p) => p + 1); void loadAllActivities(activitiesPage + 1, false); }}
                  disabled={activitiesLoading}
                  className="w-full py-3 text-sm font-medium text-indigo-600 hover:bg-indigo-50 transition-colors flex items-center justify-center gap-1"
                >
                  {activitiesLoading ? <Loader2 size={14} className="animate-spin" /> : "Load more"}
                </button>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/projects"
          className="bg-white border border-slate-200 rounded-2xl p-6 hover:border-indigo-300 hover:shadow-md transition-all group"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
              <FolderKanban size={20} className="text-indigo-600" />
            </div>
            <ArrowRight size={16} className="text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
          </div>
          <h3 className="font-semibold text-slate-900 mb-1">Projects</h3>
          <p className="text-sm text-slate-500">{projects.length} projects</p>
        </Link>

        <Link
          href="/my-tasks"
          className="bg-white border border-slate-200 rounded-2xl p-6 hover:border-indigo-300 hover:shadow-md transition-all group"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="h-10 w-10 rounded-xl bg-green-50 flex items-center justify-center group-hover:bg-green-100 transition-colors">
              <CheckSquare size={20} className="text-green-600" />
            </div>
            <ArrowRight size={16} className="text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
          </div>
          <h3 className="font-semibold text-slate-900 mb-1">My Tasks</h3>
          <p className="text-sm text-slate-500">{tasks.filter((t) => t.status !== "done").length} active tasks</p>
        </Link>

        <Link
          href="/calendar"
          className="bg-white border border-slate-200 rounded-2xl p-6 hover:border-indigo-300 hover:shadow-md transition-all group"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center group-hover:bg-amber-100 transition-colors">
              <Calendar size={20} className="text-amber-600" />
            </div>
            <ArrowRight size={16} className="text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
          </div>
          <h3 className="font-semibold text-slate-900 mb-1">Calendar</h3>
          <p className="text-sm text-slate-500">View all events</p>
        </Link>
      </div>
    </div>
  );
}

function formatRelativeTime(dateStr: string) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
