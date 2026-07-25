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
  CalendarDays,
} from "lucide-react";
import type { Project, Task, Activity as ActivityType, Event } from "@/lib/types";
import { PRIORITY_CONFIG } from "@/lib/types";
import { checkDueDateNotifications } from "@/lib/dueDateChecker";
import { getHolidaysForYear } from "@/lib/holidays";
import Modal from "@/components/ui/Modal";

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activities, setActivities] = useState<ActivityType[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
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

        const [projectsRes, tasksRes, actRes, eventsRes] = await Promise.all([
          supabase
            .from("projects")
            .select("id, name, team_id, status, color, created_at")
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
          supabase
            .from("events")
            .select("*")
            .order("start_date", { ascending: true }),
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

        if (eventsRes.data) {
          const evts = eventsRes.data as Event[];
          const now = new Date();
          const sevenDaysFromNow = new Date(now.getTime() + 7 * 86400000);
          const upcoming: Event[] = [];

          for (const evt of evts) {
            if (evt.end_date && evt.end_date < now.toISOString()) continue;
            if (evt.start_date && new Date(evt.start_date) > sevenDaysFromNow) continue;
            upcoming.push(evt);

            if (evt.recurrence && evt.recurrence !== "none") {
              const expanded = expandRecurrence(evt, now, sevenDaysFromNow);
              for (const ex of expanded) {
                if (ex.id !== evt.id) upcoming.push(ex);
              }
            }
          }

          for (const h of getHolidaysForYear(now.getFullYear())) {
            const hStart = new Date(h.dateStr + "T00:00:00Z").toISOString();
            const hEnd = new Date(new Date(h.dateStr).getTime() + 86400000).toISOString().split("T")[0] + "T23:59:59Z";
            if (new Date(hEnd) < now || new Date(hStart) > sevenDaysFromNow) continue;
            upcoming.push({
              id: `holiday-${h.dateStr}`,
              title: h.name,
              description: "Barbados Public Holiday",
              start_date: hStart,
              end_date: hEnd,
              all_day: true,
              color: "#16a34a",
              created_by: "",
              team_id: "",
              project_id: null,
              recurrence: null,
              recurrence_end: null,
              created_at: h.dateStr,
            });
          }

          upcoming.sort((a, b) => {
            const da = new Date(a.start_date || a.created_at).getTime();
            const db = new Date(b.start_date || b.created_at).getTime();
            return da - db;
          });

          setEvents(upcoming);
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
        <div className="w-6 h-6 border-2 border-slate-200 dark:border-slate-700 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Dashboard</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Overview of all your projects and tasks</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <FolderKanban size={16} className="text-indigo-600 dark:text-indigo-400" />
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Projects</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{projects.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={16} className="text-green-600 dark:text-green-400" />
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Done</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {doneTasks}<span className="text-sm text-slate-400 dark:text-slate-500 font-normal">/{totalTasks}</span>
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={16} className="text-blue-600 dark:text-blue-400" />
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">In Progress</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{activeTasks}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Flag size={16} className="text-slate-500 dark:text-slate-400" />
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">To Do</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{todoTasks}</p>
        </div>
        <div className={`bg-white dark:bg-slate-900 border rounded-xl p-4 ${overdueTasks.length > 0 ? "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20" : "border-slate-200 dark:border-slate-700"}`}>
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={16} className="text-red-600 dark:text-red-400" />
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Overdue</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{overdueTasks.length}</p>
        </div>
      </div>

      {/* Upcoming Events */}
      {events.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <CalendarDays size={14} />
              Upcoming Events ({events.length})
            </h2>
            <Link href="/calendar" className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium">
              View calendar
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {events.slice(0, 6).map((evt) => {
              const evtDate = new Date(evt.start_date || evt.created_at);
              const isToday = evtDate.toISOString().split("T")[0] === today;
              const isTomorrow = evtDate.toISOString().split("T")[0] === new Date(Date.now() + 86400000).toISOString().split("T")[0];
              const isHoliday = String(evt.id).startsWith("holiday-");
              const isExternal = String(evt.id).startsWith("external-");
              const dateLabel = isToday ? "Today" : isTomorrow ? "Tomorrow" : evtDate.toLocaleDateString("en-GB", { weekday: "short", month: "short", day: "numeric" });

              return (
                <div
                  key={evt.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 hover:border-indigo-300 dark:hover:border-indigo-500 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-1 rounded-full shrink-0 self-stretch"
                      style={{ backgroundColor: evt.color || "#6366f1" }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{evt.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-500 dark:text-slate-400">{dateLabel}</span>
                        {isHoliday && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">Holiday</span>}
                        {isExternal && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">External</span>}
                        {evt.recurrence && evt.recurrence !== "none" && <span className="text-[10px]">🔁</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Overdue / Due Soon Alerts */}
        <div className="lg:col-span-2 space-y-4">
          {overdueTasks.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-3 flex items-center gap-2">
                <AlertCircle size={14} />
                Overdue Tasks ({overdueTasks.length})
              </h3>
              <div className="space-y-1.5">
                {overdueTasks.slice(0, 5).map((task) => (
                  <div key={task.id} className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${PRIORITY_CONFIG[task.priority].color}`}>
                        {task.priority}
                      </span>
                      <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{task.title}</span>
                    </div>
                    <span className="text-xs text-red-500 dark:text-red-400 shrink-0 ml-2">{task.due_date}</span>
                  </div>
                ))}
                {overdueTasks.length > 5 && (
                  <Link href="/my-tasks" className="block text-center text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 pt-1">
                    +{overdueTasks.length - 5} more
                  </Link>
                )}
              </div>
            </div>
          )}

          {dueToday.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-3 flex items-center gap-2">
                <Clock size={14} />
                Due Today ({dueToday.length})
              </h3>
              <div className="space-y-1.5">
                {dueToday.map((task) => (
                  <div key={task.id} className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${PRIORITY_CONFIG[task.priority].color}`}>
                        {task.priority}
                      </span>
                      <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{task.title}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {dueSoon.length > 0 && overdueTasks.length === 0 && dueToday.length === 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-400 mb-3 flex items-center gap-2">
                <Clock size={14} />
                Due Soon ({dueSoon.length})
              </h3>
              <div className="space-y-1.5">
                {dueSoon.slice(0, 5).map((task) => (
                  <div key={task.id} className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${PRIORITY_CONFIG[task.priority].color}`}>
                        {task.priority}
                      </span>
                      <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{task.title}</span>
                    </div>
                    <span className="text-xs text-blue-500 dark:text-blue-400 shrink-0 ml-2">{task.due_date}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Project Progress */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <TrendingUp size={14} />
                Project Progress
              </h2>
              <Link href="/projects" className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium">
                View all
              </Link>
            </div>
            {projects.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 text-center">
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
                      className="flex items-center gap-4 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-indigo-300 dark:hover:border-indigo-500 hover:shadow-sm transition-all"
                    >
                      <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{project.name}</p>
                          <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0 ml-2">{completed}/{total}</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: project.color }}
                          />
                        </div>
                      </div>
                      <span className="text-xs text-slate-400 dark:text-slate-500 w-8 text-right shrink-0">{pct}%</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Activity Feed */}
        <div>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
            <Activity size={14} />
            Recent Activity
          </h2>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl divide-y divide-slate-100 dark:divide-slate-700/50">
            {activities.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No activity yet</p>
            ) : (
              <>
                {activities.map((act) => (
                  <div key={act.id} className="p-3">
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
                <button
                  onClick={handleOpenAllActivities}
                  className="w-full p-3 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors flex items-center justify-center gap-1"
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
              <Loader2 size={20} className="animate-spin text-slate-400 dark:text-slate-500" />
            </div>
          ) : allActivities.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No activity yet</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {allActivities.map((act) => (
                <div key={act.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    <span className="font-medium">{allUserNames[act.user_id] || userNames[act.user_id] || "Someone"}</span>
                    {" "}{act.action}
                    {act.detail && <span className="font-medium"> {act.detail}</span>}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    {formatRelativeTime(act.created_at)}
                  </p>
                </div>
              ))}
              {hasMoreActivities && (
                <button
                  onClick={() => { setActivitiesPage((p) => p + 1); void loadAllActivities(activitiesPage + 1, false); }}
                  disabled={activitiesLoading}
                  className="w-full py-3 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors flex items-center justify-center gap-1"
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
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 hover:border-indigo-300 dark:hover:border-indigo-500 hover:shadow-md transition-all group"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="h-10 w-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/30 transition-colors">
              <FolderKanban size={20} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <ArrowRight size={16} className="text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
          </div>
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Projects</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">{projects.length} projects</p>
        </Link>

        <Link
          href="/my-tasks"
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 hover:border-indigo-300 dark:hover:border-indigo-500 hover:shadow-md transition-all group"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="h-10 w-10 rounded-xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center group-hover:bg-green-100 dark:group-hover:bg-green-900/30 transition-colors">
              <CheckSquare size={20} className="text-green-600 dark:text-green-400" />
            </div>
            <ArrowRight size={16} className="text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
          </div>
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">My Tasks</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">{tasks.filter((t) => t.status !== "done").length} active tasks</p>
        </Link>

        <Link
          href="/calendar"
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 hover:border-indigo-300 dark:hover:border-indigo-500 hover:shadow-md transition-all group"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="h-10 w-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center group-hover:bg-amber-100 dark:group-hover:bg-amber-900/30 transition-colors">
              <Calendar size={20} className="text-amber-600 dark:text-amber-400" />
            </div>
            <ArrowRight size={16} className="text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
          </div>
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Calendar</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">View all events</p>
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

function expandRecurrence(evt: Event, rangeStart: Date, rangeEnd: Date): Event[] {
  if (!evt.recurrence || evt.recurrence === "none" || !evt.start_date) return [];
  const results: Event[] = [];
  const originalStart = new Date(evt.start_date);
  const originalEnd = evt.end_date ? new Date(evt.end_date) : null;
  const duration = originalEnd ? originalEnd.getTime() - originalStart.getTime() : 0;
  const recEnd = evt.recurrence_end ? new Date(evt.recurrence_end) : new Date(rangeEnd.getTime() + 365 * 86400000);

  let current = new Date(originalStart);
  let safety = 0;
  const maxIterations = 500;

  while (current <= rangeEnd && current <= recEnd && safety < maxIterations) {
    safety++;
    const next = new Date(current);

    if (evt.recurrence === "daily") next.setDate(next.getDate() + 1);
    else if (evt.recurrence === "weekly") next.setDate(next.getDate() + 7);
    else if (evt.recurrence === "biweekly") next.setDate(next.getDate() + 14);
    else if (evt.recurrence === "monthly") next.setMonth(next.getMonth() + 1);
    else if (evt.recurrence === "yearly") next.setFullYear(next.getFullYear() + 1);

    if (next > rangeEnd || next > recEnd) break;

    const evtEnd = duration > 0 ? new Date(next.getTime() + duration) : null;
    if (next >= rangeStart) {
      results.push({
        ...evt,
        id: `${evt.id}-r-${next.getTime()}`,
        start_date: next.toISOString(),
        end_date: evtEnd ? evtEnd.toISOString() : next.toISOString(),
      });
    }

    current = next;
  }

  return results;
}
