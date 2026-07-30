"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Users, Search, Building2, Mail, ShieldCheck, ShieldAlert,
} from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  cover_photo_url: string | null;
}

interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  joined_at: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
}

interface MemberStats {
  user_id: string;
  activeTasks: number;
  overdueTasks: number;
  upcomingEvents: number;
  lastActivity: string | null;
}

export default function PeoplePage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [orgs, setOrgs] = useState<OrgInfo[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [stats, setStats] = useState<Record<string, MemberStats>>({});
  const [search, setSearch] = useState("");
  const [orgLoading, setOrgLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: memberships } = await supabase
      .from("org_members")
      .select("org_id, role, organizations(id, name, slug, cover_photo_url)")
      .eq("user_id", user.id);

    if (!memberships || memberships.length === 0) {
      setLoading(false);
      return;
    }

    const adminOrgs = (memberships as Array<{ org_id: string; role: string; organizations: OrgInfo | null }>)
      .filter((m) => (m.role === "owner" || m.role === "admin") && m.organizations)
      .map((m) => ({
        id: m.organizations!.id,
        name: m.organizations!.name,
        slug: m.organizations!.slug,
        cover_photo_url: m.organizations!.cover_photo_url,
      }));

    if (adminOrgs.length === 0) {
      setLoading(false);
      return;
    }

    setAuthorized(true);
    setOrgs(adminOrgs);
    setSelectedOrgId(adminOrgs[0].id);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadOrgMembers = useCallback(async (orgId: string) => {
    setOrgLoading(true);
    try {
      const { data: orgMembers } = await supabase
        .from("org_members")
        .select("*")
        .eq("org_id", orgId)
        .order("joined_at", { ascending: true });

      if (!orgMembers) {
        setMembers([]);
        setStats({});
        setOrgLoading(false);
        return;
      }

      const { data: profiles } = await supabase.rpc("get_org_member_profiles", { p_org_id: orgId });

      const profileMap = new Map<string, { display_name: string; avatar_url: string | null; email: string }>();
      (profiles as { user_id: string; display_name: string; avatar_url: string | null; email: string }[] | null)?.forEach((p) => {
        profileMap.set(p.user_id, p);
      });

      const enriched: OrgMember[] = orgMembers.map((m: OrgMember) => {
        const p = profileMap.get(m.user_id);
        return {
          ...m,
          display_name: p?.display_name || null,
          avatar_url: p?.avatar_url || null,
          email: p?.email || null,
        };
      });

      setMembers(enriched);

      const userIds = enriched.map((m) => m.user_id);
      if (userIds.length === 0) {
        setStats({});
        setOrgLoading(false);
        return;
      }

      const today = new Date().toISOString();

      const [tasksRes, teamMembersRes, activitiesRes] = await Promise.all([
        supabase
          .from("task_assignees")
          .select("user_id, tasks!inner(status, due_date)")
          .in("user_id", userIds),
        supabase
          .from("team_members")
          .select("user_id, team_id")
          .in("user_id", userIds),
        supabase
          .from("activities")
          .select("user_id, created_at")
          .in("user_id", userIds)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

      const taskStats: Record<string, { active: number; overdue: number }> = {};
      userIds.forEach((id) => { taskStats[id] = { active: 0, overdue: 0 }; });
      (tasksRes.data || []).forEach((row: { user_id: string; tasks: { status: string; due_date: string | null } | null }) => {
        if (!row.tasks) return;
        const s = taskStats[row.user_id];
        if (!s) return;
        if (row.tasks.status !== "done") s.active++;
        if (row.tasks.due_date && row.tasks.due_date < today.split("T")[0] && row.tasks.status !== "done") s.overdue++;
      });

      const teamIds = (teamMembersRes.data || []).map((t: { team_id: string }) => t.team_id);
      const eventsMap: Record<string, number> = {};
      userIds.forEach((id) => { eventsMap[id] = 0 });

      const { data: googleAccounts } = await supabase
        .from("user_google_accounts")
        .select("id, user_id")
        .in("user_id", userIds);

      const userAccountSet: Record<string, Set<string>> = {};
      userIds.forEach((id) => { userAccountSet[id] = new Set(); });
      (googleAccounts || []).forEach((a: { id: string; user_id: string }) => {
        userAccountSet[a.user_id]?.add(a.id);
      });
      const allAccountIds = [...new Set((googleAccounts || []).map((a: { id: string }) => a.id))] as string[];

      const orFilters: string[] = [];
      if (teamIds.length > 0) orFilters.push(`team_id.in.(${teamIds.join(",")})`);
      if (allAccountIds.length > 0) orFilters.push(`google_account_id.in.(${allAccountIds.join(",")})`);

      if (orFilters.length > 0) {
        const { data: events } = await supabase
          .from("events")
          .select("team_id, start_date, google_account_id")
          .or(orFilters.join(","))
          .gte("start_date", today)
          .lte("start_date", new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString());

        const userTeamSet: Record<string, Set<string>> = {};
        userIds.forEach((id) => { userTeamSet[id] = new Set(); });
        (teamMembersRes.data || []).forEach((tm: { user_id: string; team_id: string }) => {
          userTeamSet[tm.user_id]?.add(tm.team_id);
        });

        (events || []).forEach((ev: { team_id: string; google_account_id: string | null }) => {
          Object.entries(userTeamSet).forEach(([uid, teamSet]) => {
            if (teamSet.has(ev.team_id)) {
              eventsMap[uid] = (eventsMap[uid] || 0) + 1;
            }
          });
          if (ev.google_account_id) {
            Object.entries(userAccountSet).forEach(([uid, accountSet]) => {
              if (accountSet.has(ev.google_account_id!)) {
                eventsMap[uid] = (eventsMap[uid] || 0) + 1;
              }
            });
          }
        });
      }

      const lastActivity: Record<string, string | null> = {};
      userIds.forEach((id) => { lastActivity[id] = null; });
      (activitiesRes.data || []).forEach((a: { user_id: string; created_at: string }) => {
        if (lastActivity[a.user_id] === null) lastActivity[a.user_id] = a.created_at;
      });

      const next: Record<string, MemberStats> = {};
      userIds.forEach((id) => {
        next[id] = {
          user_id: id,
          activeTasks: taskStats[id]?.active || 0,
          overdueTasks: taskStats[id]?.overdue || 0,
          upcomingEvents: eventsMap[id] || 0,
          lastActivity: lastActivity[id] || null,
        };
      });
      setStats(next);
    } catch {
      // ignore
    } finally {
      setOrgLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (selectedOrgId) void loadOrgMembers(selectedOrgId);
  }, [selectedOrgId, loadOrgMembers]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      (m.display_name || "").toLowerCase().includes(q) ||
      (m.email || "").toLowerCase().includes(q)
    );
  }, [members, search]);

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
          The People page is only available to organization owners and admins. Ask your admin to grant you access.
        </p>
        <Link
          href="/"
          className="inline-block mt-4 text-sm text-accent hover:underline"
        >
          Go to home
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-indigo-50 flex items-center justify-center dark:bg-indigo-900/30">
            <Users size={20} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">People</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              See what your team members are working on
            </p>
          </div>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 w-64"
          />
        </div>
      </div>

      {/* Org tabs */}
      {orgs.length > 1 && (
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 mb-6 w-fit">
          {orgs.map((org) => (
            <button
              key={org.id}
              onClick={() => setSelectedOrgId(org.id)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                selectedOrgId === org.id
                  ? "bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-slate-100"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              )}
            >
              <Building2 size={12} className="inline mr-1" />
              {org.name}
            </button>
          ))}
        </div>
      )}

      {orgLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-slate-200 dark:border-slate-700 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : filteredMembers.length === 0 ? (
        <div className="text-center py-16">
          <Users size={48} className="text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">No members found</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {search ? "Try a different search term" : "No members in this organization yet"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredMembers.map((member) => {
            const s = stats[member.user_id];
            const lastActive = s?.lastActivity ? new Date(s.lastActivity) : null;
            const lastActiveStr = lastActive
              ? lastActive.toLocaleDateString(undefined, { month: "short", day: "numeric" })
              : "Never";
            return (
              <Link
                key={member.id}
                href={`/people/${member.user_id}?org=${selectedOrgId}`}
                className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 hover:border-accent/50 hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-3 mb-3">
                  <Avatar
                    email={member.user_id}
                    avatarUrl={member.avatar_url || undefined}
                    name={member.display_name || undefined}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate group-hover:text-accent dark:group-hover:text-accent transition-colors">
                      {member.display_name || member.email || "Unknown"}
                    </p>
                    {member.email && member.display_name && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{member.email}</p>
                    )}
                    <div className="mt-1">
                      <Badge variant={member.role === "owner" ? "info" : member.role === "admin" ? "warning" : "default"}>
                        {member.role === "owner" && <ShieldCheck size={10} className="inline mr-0.5" />}
                        {member.role === "admin" && <ShieldAlert size={10} className="inline mr-0.5" />}
                        {member.role}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 py-2">
                    <p className="text-base font-bold text-slate-900 dark:text-slate-100">{s?.activeTasks ?? 0}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">Active</p>
                  </div>
                  <div className={cn(
                    "rounded-lg py-2",
                    (s?.overdueTasks ?? 0) > 0
                      ? "bg-red-50 dark:bg-red-900/20"
                      : "bg-slate-50 dark:bg-slate-800/50"
                  )}>
                    <p className={cn(
                      "text-base font-bold",
                      (s?.overdueTasks ?? 0) > 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-slate-900 dark:text-slate-100"
                    )}>
                      {s?.overdueTasks ?? 0}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">Overdue</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 py-2">
                    <p className="text-base font-bold text-slate-900 dark:text-slate-100">{s?.upcomingEvents ?? 0}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">Meetings</p>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-3 flex items-center gap-1">
                  <Mail size={10} />
                  Last activity {lastActiveStr}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
