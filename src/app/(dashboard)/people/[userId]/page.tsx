"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft, Calendar, CheckSquare, Clock, AlertTriangle,
  ListTodo, FolderKanban, Activity as ActivityIcon,
  ShieldCheck, ShieldAlert, Video,
} from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import CountdownTimer from "@/components/CountdownTimer";
import EventDetailModal, { type EventDetailData } from "@/components/EventDetailModal";
import { addDaysToDate, cn, dateInTimezone, DEFAULT_TIMEZONE } from "@/lib/utils";

interface MemberProfile {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
  accent_colour: string | null;
  timezone: string | null;
  role: "owner" | "admin" | "member" | null;
  joined_at: string | null;
}

interface TaskRow {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  due_date: string | null;
  project_id: string;
  project_name?: string;
  project_color?: string;
}

interface EventRow {
  id: string;
  title: string;
  description?: string | null;
  start_date: string;
  end_date: string;
  color: string;
  all_day: boolean;
  meet_link: string | null;
  team_name?: string;
  attendees?: Array<{ email: string; name?: string; status?: string }> | null;
}

interface ActivityRow {
  id: string;
  action: string;
  detail: string | null;
  project_id: string | null;
  task_id: string | null;
  created_at: string;
}

interface ProjectRow {
  id: string;
  name: string;
  color: string;
  team_name?: string;
  task_count: number;
  open_count: number;
}

const STATUS_COLORS: Record<string, string> = {
  todo: "bg-slate-400",
  in_progress: "bg-blue-500",
  done: "bg-green-500",
};

export default function MemberDetailPage() {
  const params = useParams<{ userId: string }>();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const userId = params?.userId || "";

  const orgId = searchParams?.get("org") || null;

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventDetailData | null>(null);

  // "Today" is the person's local calendar day (their saved timezone), so
  // overdue / due-this-week counts match what they see in their own list.
  const tz = member?.timezone || DEFAULT_TIMEZONE;
  const today = useMemo(() => dateInTimezone(tz), [tz]);
  const weekFromNow = useMemo(() => addDaysToDate(today, 7), [today]);
  // eslint-disable-next-line react-hooks/purity
  const nowMs = useMemo(() => Date.now(), []);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: myMemberships } = await supabase
        .from("org_members")
        .select("org_id, role")
        .eq("user_id", user.id);

      const adminOrgIds = (myMemberships || [])
        .filter((m: { role: string }) => m.role === "owner" || m.role === "admin")
        .map((m: { org_id: string }) => m.org_id);

      if (adminOrgIds.length === 0) {
        setAuthorized(false);
        setLoading(false);
        return;
      }
      setAuthorized(true);

      // Profile
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("user_id, display_name, avatar_url, accent_colour, timezone")
        .eq("user_id", userId)
        .maybeSingle();

      let memberRole: MemberProfile["role"] = null;
      let joinedAt: string | null = null;
      if (orgId) {
        const { data: orgMembership } = await supabase
          .from("org_members")
          .select("role, joined_at")
          .eq("user_id", userId)
          .eq("org_id", orgId)
          .maybeSingle();
        if (orgMembership) {
          memberRole = orgMembership.role as MemberProfile["role"];
          joinedAt = orgMembership.joined_at;
        }
      }

      let email: string | null = null;
      if (orgId) {
        const { data: profiles } = await supabase.rpc("get_org_member_profiles", { p_org_id: orgId });
        const p = (profiles as { user_id: string; email: string }[] | null)?.find((x) => x.user_id === userId);
        email = p?.email || null;
      }

      setMember({
        user_id: userId,
        display_name: profile?.display_name || null,
        avatar_url: profile?.avatar_url || null,
        email,
        accent_colour: profile?.accent_colour || null,
        timezone: profile?.timezone || null,
        role: memberRole,
        joined_at: joinedAt,
      });

      // Teams user belongs to
      const { data: teamMemberships } = await supabase
        .from("team_members")
        .select("team_id, teams(id, name, org_id)")
        .eq("user_id", userId);

      const teamRows = teamMemberships || [];
      const teamIds = teamRows.map((t: { team_id: string }) => t.team_id);
      const teamNameMap = new Map<string, string>();
      teamRows.forEach((t: { team_id: string; teams: { name: string } | null }) => {
        if (t.teams) teamNameMap.set(t.team_id, t.teams.name);
      });

      // Tasks
      const { data: taskAssigns } = await supabase
        .from("task_assignees")
        .select("tasks(id, title, status, priority, due_date, project_id, projects(id, name, color))")
        .eq("user_id", userId);

      const taskRows: TaskRow[] = (taskAssigns || [])
        .map((row: { tasks: TaskRow & { projects: { id: string; name: string; color: string } | null } | null }) => row.tasks)
        .filter(Boolean)
        .map((t: TaskRow & { projects: { id: string; name: string; color: string } | null }) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          due_date: t.due_date,
          project_id: t.project_id,
          project_name: t.projects?.name,
          project_color: t.projects?.color,
        }));
      setTasks(taskRows);

      // Events: fetch via server-side API (combines internal events + live Google Calendar data for all linked accounts)
      try {
        const res = await fetch(`/api/people/${userId}/calendar?days=14`);
        if (res.ok) {
          const data = await res.json();
          const apiEvents: Array<{
            id: string;
            title: string;
            description?: string;
            start: string;
            end: string;
            allDay: boolean;
            color: string;
            source: string;
            meetLink: string | null;
            attendees?: Array<{ email: string; name?: string; status?: string }>;
          }> = data.events || [];

          setEvents(
            apiEvents.map((e) => ({
              id: e.id,
              title: e.title,
              description: e.description || null,
              start_date: e.start,
              end_date: e.end,
              color: e.color,
              all_day: e.allDay,
              meet_link: e.meetLink,
              team_name: e.source,
              attendees: e.attendees || null,
            }))
          );
        } else {
          setEvents([]);
        }
      } catch {
        setEvents([]);
      }

      // Activity
      const { data: activityData } = await supabase
        .from("activities")
        .select("id, action, detail, project_id, task_id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      setActivities(activityData || []);

      // Projects
      if (teamIds.length > 0) {
        const { data: projectsData } = await supabase
          .from("projects")
          .select("id, name, color, team_id, status, tasks(id, status)")
          .in("team_id", teamIds)
          .in("status", ["active", "completed"])
          .order("name");

        const projectRows: ProjectRow[] = (projectsData || []).map(
          (p: { id: string; name: string; color: string; team_id: string; tasks: { id: string; status: string }[] | null }) => ({
            id: p.id,
            name: p.name,
            color: p.color,
            team_name: teamNameMap.get(p.team_id),
            task_count: p.tasks?.length || 0,
            open_count: p.tasks?.filter((t) => t.status !== "done").length || 0,
          })
        );
        setProjects(projectRows);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [supabase, userId, orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-slate-200 dark:border-slate-700 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <ShieldCheck size={48} className="text-slate-300 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">Admin access required</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          You need to be an organization owner or admin to view member details.
        </p>
        <Link href="/people" className="inline-block mt-4 text-sm text-accent hover:underline">
          Back to People
        </Link>
      </div>
    );
  }

  const overdueTasks = tasks.filter((t) => t.status !== "done" && t.due_date && t.due_date < today);
  const inProgressTasks = tasks.filter((t) => t.status === "in_progress");
  const dueThisWeekTasks = tasks.filter(
    (t) => t.status !== "done" && t.due_date && t.due_date >= today && t.due_date <= weekFromNow
  );
  const todoTasks = tasks.filter((t) => t.status === "todo" && (!t.due_date || t.due_date >= today));

  const upcomingEvents = events.slice(0, 6);
  const meetingCount = events.length;

  function timeAgo(iso: string): string {
    const diff = nowMs - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Back link */}
      <Link
        href="/people"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4 transition-colors"
      >
        <ArrowLeft size={14} />
        Back to People
      </Link>

      {/* Profile header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 mb-6">
        <div className="flex items-start gap-4">
          <Avatar
            email={member?.user_id || ""}
            avatarUrl={member?.avatar_url || undefined}
            name={member?.display_name || undefined}
            size="lg"
          />
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {member?.display_name || member?.email || "Unknown"}
            </h1>
            {member?.email && member.display_name && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{member.email}</p>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {member?.role && (
                <Badge variant={member.role === "owner" ? "info" : member.role === "admin" ? "warning" : "default"}>
                  {member.role === "owner" && <ShieldCheck size={10} className="inline mr-0.5" />}
                  {member.role === "admin" && <ShieldAlert size={10} className="inline mr-0.5" />}
                  {member.role}
                </Badge>
              )}
              {member?.timezone && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {member.timezone.replace(/_/g, " ")}
                </span>
              )}
              {member?.joined_at && (
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  · Joined {new Date(member.joined_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock size={14} className="text-blue-500" />
            <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">In Progress</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{inProgressTasks.length}</p>
        </div>
        <div className={cn(
          "border rounded-xl p-4",
          overdueTasks.length > 0
            ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
            : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
        )}>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={14} className={overdueTasks.length > 0 ? "text-red-500" : "text-slate-400"} />
            <span className={cn(
              "text-[10px] font-medium uppercase tracking-wider",
              overdueTasks.length > 0 ? "text-red-600 dark:text-red-400" : "text-slate-400 dark:text-slate-500"
            )}>Overdue</span>
          </div>
          <p className={cn(
            "text-2xl font-bold",
            overdueTasks.length > 0 ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-slate-100"
          )}>{overdueTasks.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Calendar size={14} className="text-cyan-500" />
            <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">This Week</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{dueThisWeekTasks.length}</p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500">due</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Video size={14} className="text-indigo-500" />
            <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Meetings</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{meetingCount}</p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500">next 14d</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tasks column */}
        <div className="space-y-4">
          {/* Overdue */}
          {overdueTasks.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <AlertTriangle size={12} />
                Overdue ({overdueTasks.length})
              </h3>
              <div className="space-y-1.5">
                {overdueTasks.slice(0, 8).map((t) => (
                  <TaskRowItem key={t.id} task={t} />
                ))}
                {overdueTasks.length > 8 && (
                  <p className="text-[11px] text-slate-500 pt-1">+{overdueTasks.length - 8} more</p>
                )}
              </div>
            </div>
          )}

          {/* In progress */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Clock size={12} />
              In Progress ({inProgressTasks.length})
            </h3>
            {inProgressTasks.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 py-2">Nothing in progress</p>
            ) : (
              <div className="space-y-1.5">
                {inProgressTasks.slice(0, 10).map((t) => (
                  <TaskRowItem key={t.id} task={t} />
                ))}
                {inProgressTasks.length > 10 && (
                  <p className="text-[11px] text-slate-500 pt-1">+{inProgressTasks.length - 10} more</p>
                )}
              </div>
            )}
          </div>

          {/* Due this week */}
          {dueThisWeekTasks.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Calendar size={12} />
                Due This Week ({dueThisWeekTasks.length})
              </h3>
              <div className="space-y-1.5">
                {dueThisWeekTasks.slice(0, 8).map((t) => (
                  <TaskRowItem key={t.id} task={t} />
                ))}
                {dueThisWeekTasks.length > 8 && (
                  <p className="text-[11px] text-slate-500 pt-1">+{dueThisWeekTasks.length - 8} more</p>
                )}
              </div>
            </div>
          )}

          {/* To do (no due date or future) */}
          {todoTasks.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <ListTodo size={12} />
                To Do ({todoTasks.length})
              </h3>
              <div className="space-y-1.5">
                {todoTasks.slice(0, 6).map((t) => (
                  <TaskRowItem key={t.id} task={t} />
                ))}
                {todoTasks.length > 6 && (
                  <p className="text-[11px] text-slate-500 pt-1">+{todoTasks.length - 6} more</p>
                )}
              </div>
            </div>
          )}

          {tasks.length === 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-8 text-center">
              <CheckSquare size={32} className="text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-500 dark:text-slate-400">No tasks assigned</p>
            </div>
          )}
        </div>

        {/* Right column: events, activity, projects */}
        <div className="space-y-4">
          {/* Upcoming meetings */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Calendar size={12} />
              Upcoming Meetings ({upcomingEvents.length})
            </h3>
            {upcomingEvents.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 py-2">No meetings in the next 14 days</p>
            ) : (
              <div className="space-y-2">
                {upcomingEvents.map((e, index) => {
                  const start = new Date(e.start_date);
                  const endMs = e.end_date ? new Date(e.end_date).getTime() : null;
                  const dayLabel = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
                  const timeLabel = e.all_day
                    ? "All day"
                    : start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
                  const isInProgress = endMs !== null && start.getTime() <= nowMs && nowMs < endMs;
                  const showCountdown = index === 0 && !e.all_day && (isInProgress || (start.getTime() > nowMs && start.getTime() - nowMs <= 7 * 86400000));
                  return (
                    <button
                      key={e.id}
                      onClick={() => setSelectedEvent({
                        id: e.id,
                        title: e.title,
                        description: e.description,
                        start: e.start_date,
                        end: e.end_date,
                        allDay: e.all_day,
                        color: e.color,
                        source: e.team_name || null,
                        meetLink: e.meet_link,
                        attendees: e.attendees,
                      })}
                      className="w-full text-left flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group"
                    >
                      <div
                        className="w-1 h-10 rounded-full shrink-0"
                        style={{ backgroundColor: e.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate group-hover:text-accent dark:group-hover:text-accent">{e.title}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {dayLabel} · {timeLabel}
                          {e.team_name && ` · ${e.team_name}`}
                        </p>
                        {showCountdown && (
                          <CountdownTimer target={start.getTime()} end={e.end_date} className="text-[11px] font-semibold text-accent mt-0.5" />
                        )}
                      </div>
                      {e.meet_link && (
                        <span
                          onClick={(ev) => { ev.stopPropagation(); window.open(e.meet_link!, "_blank"); }}
                          className="p-1.5 rounded text-slate-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                          title="Join meeting"
                        >
                          <Video size={14} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Projects */}
          {projects.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <FolderKanban size={12} />
                Projects ({projects.length})
              </h3>
              <div className="space-y-1.5">
                {projects.slice(0, 8).map((p) => {
                  const pct = p.task_count > 0 ? Math.round(((p.task_count - p.open_count) / p.task_count) * 100) : 0;
                  return (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
                    >
                      <FolderKanban size={14} style={{ color: p.color }} className="shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate group-hover:text-accent dark:group-hover:text-accent">
                          {p.name}
                        </p>
                        {p.team_name && (
                          <p className="text-[10px] text-slate-400 dark:text-slate-500">{p.team_name}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="w-12 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, backgroundColor: p.color }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 w-7 text-right">{pct}%</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Activity */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <ActivityIcon size={12} />
              Recent Activity
            </h3>
            {activities.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 py-2">No recent activity</p>
            ) : (
              <div className="space-y-2">
                {activities.slice(0, 10).map((a) => (
                  <div key={a.id} className="flex items-start gap-2 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-700 dark:text-slate-300">
                        {a.action}
                        {a.detail && <span className="text-slate-500 dark:text-slate-400"> · {a.detail}</span>}
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500">{timeAgo(a.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  );
}

function TaskRowItem({ task }: { task: TaskRow }) {
  return (
    <Link
      href={`/projects/${task.project_id}`}
      className="flex items-center gap-2 p-1.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
    >
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", STATUS_COLORS[task.status])} />
      <span className="text-xs text-slate-700 dark:text-slate-300 truncate flex-1 group-hover:text-accent dark:group-hover:text-accent">
        {task.title}
      </span>
      {task.due_date && (
        <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
          {new Date(task.due_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
      )}
      {task.project_name && (
        <span
          className="text-[10px] truncate max-w-[80px] shrink-0"
          style={{ color: task.project_color }}
          title={task.project_name}
        >
          {task.project_name}
        </span>
      )}
    </Link>
  );
}
