"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  Check,
} from "lucide-react";
import type { Task, Activity as ActivityType } from "@/lib/types";
import { PRIORITY_CONFIG } from "@/lib/types";
import { checkDueDateNotifications } from "@/lib/dueDateChecker";
import { checkTaskReminders } from "@/lib/taskReminderChecker";
import { formatRelativeTime } from "@/lib/utils";
import { useDashboardData } from "@/lib/hooks";
import CountdownTimer from "@/components/CountdownTimer";
import Modal from "@/components/ui/Modal";
import Skeleton from "@/components/ui/Skeleton";
import EventDetailModal, { type EventDetailData } from "@/components/EventDetailModal";
import { useRealtimeRefresh } from "@/lib/useRealtimeRefresh";

export default function DashboardPage() {
  const { projects, tasks: swrTasks, activities: swrActivities, events, userNames: swrUserNames, loading, refresh } = useDashboardData();
  useRealtimeRefresh({ tables: ["tasks", "events", "activities"], swrKeys: ["dashboard"] });
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [allActivities, setAllActivities] = useState<ActivityType[]>([]);
  const [allUserNames, setAllUserNames] = useState<Record<string, string>>({});
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [activitiesPage, setActivitiesPage] = useState(0);
  const [hasMoreActivities, setHasMoreActivities] = useState(true);
  const [activityFilterAction, setActivityFilterAction] = useState("");
  const [activityFilterProject, setActivityFilterProject] = useState("");
  const supabase = createClient();
  const ACTIVITIES_PER_PAGE = 20;
  const [selectedEvent, setSelectedEvent] = useState<EventDetailData | null>(null);
  const displayEvents = events.slice(0, 6);
  // eslint-disable-next-line react-hooks/purity
  const nowMs = useMemo(() => Date.now(), []);

  // Due-date and reminder checks run once on mount; both throttle themselves
  // so frequent data refreshes can't trigger a request storm.
  useEffect(() => {
    void checkDueDateNotifications();
    void checkTaskReminders();
  }, []);

  function updateActivityParams(next: { open?: boolean; action?: string; project?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    const open = next.open ?? showAllActivities;
    const action = next.action ?? activityFilterAction;
    const project = next.project ?? activityFilterProject;
    if (open) params.set("activity", "all"); else params.delete("activity");
    if (action) params.set("action", action); else params.delete("action");
    if (project) params.set("project", project); else params.delete("project");
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  }

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

  useEffect(() => {
    const open = searchParams.get("activity") === "all";
    const action = searchParams.get("action") ?? "";
    const project = searchParams.get("project") ?? "";
    const wasOpen = showAllActivities;
    setShowAllActivities(open);
    setActivityFilterAction(action);
    setActivityFilterProject(project);
    if (open && !wasOpen) {
      setActivitiesPage(0);
      setHasMoreActivities(true);
      setAllActivities([]);
      void loadAllActivities(0, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function handleQuickComplete(taskId: string) {
    const optimistic = {
      projects,
      tasks: swrTasks.map((t) => (t.id === taskId ? { ...t, status: "done" as const } : t)),
      activities: swrActivities,
      events,
      userNames: swrUserNames,
    };
    refresh(optimistic, { revalidate: false });
    const { error } = await supabase.from("tasks").update({ status: "done" }).eq("id", taskId);
    void refresh();
    if (error) return;
  }
  const [today] = useState(() => new Date().toISOString().split("T")[0]);

  const [tomorrow] = useState(() => new Date(Date.now() + 86400000).toISOString().split("T")[0]);
  const taskStats = useMemo(() => {
    const result = {
      total: swrTasks.length,
      done: 0,
      inProgress: 0,
      todo: 0,
      overdue: [] as Task[],
      dueToday: [] as Task[],
      dueSoon: [] as Task[],
    };

    for (const t of swrTasks) {
      if (t.status === "done") result.done++;
      else if (t.status === "in_progress") result.inProgress++;
      else result.todo++;

      if (t.status !== "done" && t.due_date) {
        if (t.due_date < today) result.overdue.push(t);
        else if (t.due_date === today) result.dueToday.push(t);
        else {
          const due = new Date(t.due_date);
          const now = new Date();
          const diff = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
          if (diff <= 3) result.dueSoon.push(t);
        }
      }
    }
    return result;
  }, [swrTasks, today]);

  const projectTaskCounts = useMemo(() => {
    const counts = new Map<string, { total: number; done: number }>();
    for (const t of swrTasks) {
      if (!counts.has(t.project_id)) counts.set(t.project_id, { total: 0, done: 0 });
      const c = counts.get(t.project_id)!;
      c.total++;
      if (t.status === "done") c.done++;
    }
    return counts;
  }, [swrTasks]);

  const uniqueActions = [...new Set(allActivities.map((a) => a.action))].sort();
  const filteredActivities = allActivities.filter((a) => {
    if (activityFilterAction && a.action !== activityFilterAction) return false;
    if (activityFilterProject && a.project_id !== activityFilterProject) return false;
    return true;
  });

  // Per-panel "Show more" state for the Overdue / Due Today / Due Soon lists.
  const [showAllOverdue, setShowAllOverdue] = useState(false);
  const [showAllDueToday, setShowAllDueToday] = useState(false);
  const [showAllDueSoon, setShowAllDueSoon] = useState(false);

  const activeProjectCount = projects.filter((p) => p.status === "active").length;
  const activeTaskCount = swrTasks.filter((t) => t.status !== "done").length;
  const upcomingEventCount = events.length;

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="mb-8">
          <Skeleton className="h-4 w-40 mb-3" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2">
            <Skeleton className="h-4 w-36 mb-3" />
            <Skeleton className="h-48 rounded-2xl" />
          </div>
          <div>
            <Skeleton className="h-4 w-32 mb-3" />
            <Skeleton className="h-48 rounded-2xl" />
          </div>
        </div>
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
            <FolderKanban size={16} className="text-accent" />
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
            {taskStats.done}<span className="text-sm text-slate-400 dark:text-slate-500 font-normal">/{taskStats.total}</span>
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={16} className="text-blue-600 dark:text-blue-400" />
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">In Progress</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{taskStats.inProgress}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Flag size={16} className="text-slate-500 dark:text-slate-400" />
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">To Do</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{taskStats.todo}</p>
        </div>
        <div className={`bg-white dark:bg-slate-900 border rounded-xl p-4 ${taskStats.overdue.length > 0 ? "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20" : "border-slate-200 dark:border-slate-700"}`}>
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={16} className="text-red-600 dark:text-red-400" />
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Overdue</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{taskStats.overdue.length}</p>
        </div>
      </div>

      {/* Upcoming Events */}
      {displayEvents.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <CalendarDays size={14} />
              Upcoming Events ({displayEvents.length})
            </h2>
            <Link href="/calendar" className="text-xs text-accent hover:text-indigo-700 dark:hover:text-indigo-300 font-medium">
              View calendar
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {displayEvents.map((evt, index) => {
              const evtDate = new Date(evt.start_date || evt.created_at);
              const isToday = evtDate.toISOString().split("T")[0] === today;
              const isTomorrow = evtDate.toISOString().split("T")[0] === tomorrow;
              const isHoliday = String(evt.id).startsWith("holiday-");
              const isExternal = String(evt.id).startsWith("external-");
              const dateLabel = isToday ? "Today" : isTomorrow ? "Tomorrow" : evtDate.toLocaleDateString("en-GB", { weekday: "short", month: "short", day: "numeric" });
              const evtEndMs = evt.end_date ? new Date(evt.end_date).getTime() : null;
              const isInProgress = evtEndMs !== null && evtDate.getTime() <= nowMs && nowMs < evtEndMs;
              const showCountdown = index === 0 && !evt.all_day && (isInProgress || (evtDate.getTime() > nowMs && evtDate.getTime() - nowMs <= 7 * 86400000));

              return (
                <button
                  key={evt.id}
                  onClick={() => setSelectedEvent({
                    id: evt.id,
                    title: evt.title,
                    description: evt.description,
                    start: evt.start_date || evt.created_at,
                    end: evt.end_date,
                    allDay: evt.all_day,
                    color: evt.color || "#6366f1",
                    source: isExternal ? (evt.source || "External") : null,
                    meetLink: evt.meet_link,
                    attendees: evt.attendees,
                    recurrence: evt.recurrence,
                    external: isExternal,
                  })}
                  className="w-full text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 hover:border-accent/50 hover:shadow-sm transition-all cursor-pointer group"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-1 rounded-full shrink-0 self-stretch"
                      style={{ backgroundColor: evt.color || "#6366f1" }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate group-hover:text-accent dark:group-hover:text-accent">{evt.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-500 dark:text-slate-400">{dateLabel}</span>
                        {isHoliday && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">Holiday</span>}
                        {isExternal && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">External</span>}
                        {evt.recurrence && evt.recurrence !== "none" && <span className="text-[10px]">🔁</span>}
                      </div>
                      {showCountdown && (
                        <div className="mt-1.5">
                          <CountdownTimer target={evtDate.getTime()} end={evt.end_date} className="text-xs font-semibold text-accent" />
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
        {/* Overdue / Due Soon Alerts */}
        <div className="xl:col-span-2 space-y-4">
          {taskStats.overdue.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-red-700 dark:text-red-400 flex items-center gap-2">
                  <AlertCircle size={14} />
                  Overdue Tasks ({taskStats.overdue.length})
                </h3>
                <Link href="/my-tasks?due_before=overdue" className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium">
                  View all
                </Link>
              </div>
              <div className="space-y-1.5">
                {taskStats.overdue.slice(0, showAllOverdue ? taskStats.overdue.length : 3).map((task) => (
                  <div key={task.id} className="flex items-center justify-between gap-3 p-2.5 bg-white dark:bg-slate-800 rounded-lg group">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <button
                        onClick={() => void handleQuickComplete(task.id)}
                        className="h-4 w-4 rounded border-2 border-slate-300 dark:border-slate-600 hover:border-green-400 flex items-center justify-center shrink-0 transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100"
                        title="Mark as done"
                      >
                        <Check size={10} className="text-transparent group-hover:text-green-400" />
                      </button>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${PRIORITY_CONFIG[task.priority].color}`}>
                        {task.priority}
                      </span>
                      <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{task.title}</span>
                    </div>
                    <span className="text-xs font-medium text-red-500 dark:text-red-400 shrink-0">{task.due_date}</span>
                  </div>
                ))}
                {taskStats.overdue.length > 3 && (
                  <button
                    onClick={() => setShowAllOverdue((v) => !v)}
                    className="w-full text-center text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 pt-1 font-medium"
                  >
                    {showAllOverdue ? "Show less" : `Show ${taskStats.overdue.length - 3} more`}
                  </button>
                )}
              </div>
            </div>
          )}

          {taskStats.dueToday.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2">
                  <Clock size={14} />
                  Due Today ({taskStats.dueToday.length})
                </h3>
                <Link href="/my-tasks?due_before=today" className="text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 font-medium">
                  View all
                </Link>
              </div>
              <div className="space-y-1.5">
                {taskStats.dueToday.slice(0, showAllDueToday ? taskStats.dueToday.length : 3).map((task) => (
                  <div key={task.id} className="flex items-center justify-between gap-3 p-2.5 bg-white dark:bg-slate-800 rounded-lg group">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <button
                        onClick={() => void handleQuickComplete(task.id)}
                        className="h-4 w-4 rounded border-2 border-slate-300 dark:border-slate-600 hover:border-green-400 flex items-center justify-center shrink-0 transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100"
                        title="Mark as done"
                      >
                        <Check size={10} className="text-transparent group-hover:text-green-400" />
                      </button>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${PRIORITY_CONFIG[task.priority].color}`}>
                        {task.priority}
                      </span>
                      <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{task.title}</span>
                    </div>
                    <span className="text-xs font-medium text-amber-600 dark:text-amber-400 shrink-0">Today</span>
                  </div>
                ))}
                {taskStats.dueToday.length > 3 && (
                  <button
                    onClick={() => setShowAllDueToday((v) => !v)}
                    className="w-full text-center text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 pt-1 font-medium"
                  >
                    {showAllDueToday ? "Show less" : `Show ${taskStats.dueToday.length - 3} more`}
                  </button>
                )}
              </div>
            </div>
          )}

          {taskStats.dueSoon.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-2">
                  <Clock size={14} />
                  Due Soon ({taskStats.dueSoon.length})
                </h3>
                <Link href="/my-tasks?due_before=week" className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium">
                  View all
                </Link>
              </div>
              <div className="space-y-1.5">
                {taskStats.dueSoon.slice(0, showAllDueSoon ? taskStats.dueSoon.length : 3).map((task) => (
                  <div key={task.id} className="flex items-center justify-between gap-3 p-2.5 bg-white dark:bg-slate-800 rounded-lg group">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <button
                        onClick={() => void handleQuickComplete(task.id)}
                        className="h-4 w-4 rounded border-2 border-slate-300 dark:border-slate-600 hover:border-green-400 flex items-center justify-center shrink-0 transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100"
                        title="Mark as done"
                      >
                        <Check size={10} className="text-transparent group-hover:text-green-400" />
                      </button>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${PRIORITY_CONFIG[task.priority].color}`}>
                        {task.priority}
                      </span>
                      <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{task.title}</span>
                    </div>
                    <span className="text-xs font-medium text-blue-500 dark:text-blue-400 shrink-0">{task.due_date}</span>
                  </div>
                ))}
                {taskStats.dueSoon.length > 3 && (
                  <button
                    onClick={() => setShowAllDueSoon((v) => !v)}
                    className="w-full text-center text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 pt-1 font-medium"
                  >
                    {showAllDueSoon ? "Show less" : `Show ${taskStats.dueSoon.length - 3} more`}
                  </button>
                )}
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
              <Link href="/all-projects" className="text-xs text-accent hover:text-indigo-700 dark:hover:text-indigo-300 font-medium">
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
                  const counts = projectTaskCounts.get(project.id) || { total: 0, done: 0 };
                  const total = counts.total;
                  const completed = counts.done;
                  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

                  return (
                    <Link
                      key={project.id}
                      href={`/projects/${project.id}`}
                      className="flex items-center gap-4 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-accent/50 hover:shadow-sm transition-all"
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
            {swrActivities.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No activity yet</p>
            ) : (
              <>
                {swrActivities.map((act) => (
                  <div key={act.id} className="p-3">
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      <span className="font-medium">{swrUserNames[act.user_id] || "Someone"}</span>
                      {" "}{act.action}
                      {act.detail && <span className="font-medium"> {act.detail}</span>}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                      {formatRelativeTime(act.created_at)}
                    </p>
                  </div>
                ))}
                <Link
                  href="/activity"
                  className="w-full p-3 text-sm font-medium text-accent hover:bg-accent/10 transition-colors flex items-center justify-center gap-1"
                >
                  View all activity <ChevronRight size={14} />
                </Link>
              </>
            )}
          </div>

          {/* Shortcuts */}
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 mt-6 flex items-center gap-2">
            <ArrowRight size={14} />
            Shortcuts
          </h2>
          <div className="space-y-2">
            <Link
              href="/all-projects"
              className="flex items-center gap-3 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-accent/50 hover:shadow-sm transition-all group"
            >
              <div className="h-8 w-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center shrink-0">
                <FolderKanban size={16} className="text-accent" />
              </div>
              <span className="text-sm font-medium text-slate-900 dark:text-slate-100 flex-1">Projects</span>
              <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">{activeProjectCount} active</span>
              <ChevronRight size={14} className="text-slate-300 dark:text-slate-600 group-hover:text-accent transition-colors shrink-0" />
            </Link>

            <Link
              href="/my-tasks"
              className="flex items-center gap-3 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-accent/50 hover:shadow-sm transition-all group"
            >
              <div className="h-8 w-8 rounded-lg bg-green-50 dark:bg-green-900/20 flex items-center justify-center shrink-0">
                <CheckSquare size={16} className="text-green-600 dark:text-green-400" />
              </div>
              <span className="text-sm font-medium text-slate-900 dark:text-slate-100 flex-1">My Tasks</span>
              <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">{activeTaskCount} active</span>
              <ChevronRight size={14} className="text-slate-300 dark:text-slate-600 group-hover:text-accent transition-colors shrink-0" />
            </Link>

            <Link
              href="/calendar"
              className="flex items-center gap-3 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-accent/50 hover:shadow-sm transition-all group"
            >
              <div className="h-8 w-8 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center shrink-0">
                <Calendar size={16} className="text-amber-600 dark:text-amber-400" />
              </div>
              <span className="text-sm font-medium text-slate-900 dark:text-slate-100 flex-1">Calendar</span>
              <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">{upcomingEventCount} upcoming</span>
              <ChevronRight size={14} className="text-slate-300 dark:text-slate-600 group-hover:text-accent transition-colors shrink-0" />
            </Link>
          </div>
        </div>
      </div>

      {/* Full Activity Modal */}
      <Modal open={showAllActivities} onClose={() => { updateActivityParams({ open: false, action: "", project: "" }); }} title="All Activity">
        <div className="max-h-[60vh] overflow-y-auto">
          {allActivities.length === 0 && activitiesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-slate-400 dark:text-slate-500" />
            </div>
          ) : allActivities.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No activity yet</p>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-200 dark:border-slate-700">
                <select
                  value={activityFilterAction}
                  onChange={(e) => updateActivityParams({ action: e.target.value })}
                  className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-accent/50"
                >
                  <option value="">All actions</option>
                  {uniqueActions.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
                <select
                  value={activityFilterProject}
                  onChange={(e) => updateActivityParams({ project: e.target.value })}
                  className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-accent/50"
                >
                  <option value="">All projects</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {(activityFilterAction || activityFilterProject) && (
                  <button
                    onClick={() => updateActivityParams({ action: "", project: "" })}
                    className="text-xs text-accent hover:text-indigo-700 font-medium"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {filteredActivities.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No matching activity</p>
                ) : filteredActivities.map((act) => (
                <div key={act.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    <span className="font-medium">{allUserNames[act.user_id] || swrUserNames[act.user_id] || "Someone"}</span>
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
                  className="w-full py-3 text-sm font-medium text-accent hover:bg-accent/10 transition-colors flex items-center justify-center gap-1"
                >
                  {activitiesLoading ? <Loader2 size={14} className="animate-spin" /> : "Load more"}
                </button>
              )}
              </div>
            </>
          )}
        </div>
      </Modal>

      <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  );
}


