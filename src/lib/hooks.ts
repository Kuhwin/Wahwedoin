"use client";

import useSWR from "swr";
import { createClient } from "./supabase/client";
import type { Task, Project, Activity, Event } from "./types";

function getSupabase() {
  return createClient();
}

const EMPTY_PROJECTS: Project[] = [];
const EMPTY_TASKS: Task[] = [];
const EMPTY_ACTIVITIES: Activity[] = [];
const EMPTY_EVENTS: Event[] = [];
const EMPTY_USERNAMES: Record<string, string> = {};

export function useDashboardData() {
  const { data, isLoading, mutate } = useSWR(
    "dashboard",
    async () => {
      const supabase = getSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { projects: [] as Project[], tasks: [] as Task[], activities: [] as Activity[], events: [] as Event[], userNames: {} as Record<string, string> };

      const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();
      const thirtyDaysFromNow = new Date(Date.now() + 30 * 86400000).toISOString();

      const [projectsRes, tasksRes, actRes, eventsRes] = await Promise.all([
        supabase
          .from("projects")
          .select("id, name, team_id, status, color, created_at")
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("tasks")
          .select("id, project_id, title, status, priority, due_date, position, created_at")
          .gte("created_at", ninetyDaysAgo)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("activities")
          .select("id, user_id, action, detail, created_at")
          .order("created_at", { ascending: false })
          .limit(7),
        supabase
          .from("events")
          .select("*")
          .gte("start_date", ninetyDaysAgo)
          .lte("start_date", thirtyDaysFromNow)
          .order("start_date", { ascending: true }),
      ]);

      const projects = (projectsRes.data ?? []) as Project[];
      const tasks = (tasksRes.data ?? []) as Task[];
      const activities = (actRes.data ?? []) as Activity[];

      const userIds = [...new Set(activities.map((a) => a.user_id).filter(Boolean))];
      const userNames: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("user_profiles")
          .select("user_id, display_name")
          .in("user_id", userIds);
        if (profiles) {
          (profiles as { user_id: string; display_name: string }[]).forEach((p) => {
            userNames[p.user_id] = p.display_name;
          });
        }
      }

      const evts = (eventsRes.data ?? []) as Event[];
      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 86400000);
      const upcoming: Event[] = [];

      for (const evt of evts) {
        if (evt.end_date && evt.end_date < now.toISOString()) continue;
        if (evt.start_date && new Date(evt.start_date) > sevenDaysFromNow) continue;
        upcoming.push(evt);
      }

      try {
        const gcalRes = await fetch("/api/calendar/google?days=30");
        if (gcalRes.ok) {
          const gcalData = (await gcalRes.json()) as {
            events?: Array<{
              accountColor: string;
              events: Array<{
                id: string;
                title: string;
                description: string;
                start: string;
                end: string;
                allDay: boolean;
                source: string;
                meetLink: string | null;
                attendees: Array<{ email: string; name: string; status: string }>;
              }>;
            }>;
          };
          for (const result of gcalData.events || []) {
            for (const g of result.events) {
              if (!g.start) continue;
              const startMs = new Date(g.start).getTime();
              const endMs = g.end ? new Date(g.end).getTime() : startMs;
              if (Number.isNaN(startMs) || Number.isNaN(endMs)) continue;
              if (endMs < now.getTime()) continue;
              if (startMs > sevenDaysFromNow.getTime()) continue;
              upcoming.push({
                id: `external-gcal:${g.id}`,
                team_id: "",
                project_id: null,
                title: g.title,
                description: g.description,
                start_date: g.start,
                end_date: g.end,
                all_day: g.allDay,
                color: result.accountColor || "#4285F4",
                created_by: null,
                created_at: g.start,
                recurrence: null,
                recurrence_end: null,
                meet_link: g.meetLink,
                attendees: g.attendees || null,
                google_event_id: null,
                google_account_id: null,
                source: g.source,
              });
            }
          }
          upcoming.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
        } else {
          console.warn("[dashboard] Google events fetch failed", gcalRes.status);
        }
      } catch {
        // ignore Google fetch errors
      }

      return { projects, tasks, activities, events: upcoming, userNames };
    },
    { revalidateOnFocus: false, dedupingInterval: 30000, revalidateOnReconnect: false }
  );

  return {
    projects: data?.projects ?? EMPTY_PROJECTS,
    tasks: data?.tasks ?? EMPTY_TASKS,
    activities: data?.activities ?? EMPTY_ACTIVITIES,
    events: data?.events ?? EMPTY_EVENTS,
    userNames: data?.userNames ?? EMPTY_USERNAMES,
    loading: isLoading,
    refresh: mutate,
  };
}
