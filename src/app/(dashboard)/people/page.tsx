"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Users, Search, Mail, ShieldCheck, ShieldAlert, BarChart3,
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
  teams?: string[];
}

interface PeopleScope {
  key: string;
  type: "org" | "team";
  id: string;
  label: string;
  orgId?: string | null;
}

interface MemberStats {
  user_id: string;
  activeTasks: number;
  overdueTasks: number;
  upcomingEvents: number;
  lastActivity: string | null;
}

interface WorkloadStats {
  user_id: string;
  open: number;
  in_progress: number;
  overdue: number;
}

export default function PeoplePage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [scopes, setScopes] = useState<PeopleScope[]>([]);
  const [selectedScopeKey, setSelectedScopeKey] = useState<string | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [stats, setStats] = useState<Record<string, MemberStats>>({});
  const [workload, setWorkload] = useState<Record<string, WorkloadStats>>({});
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

    const adminOrgs = ((memberships || []) as Array<{ org_id: string; role: string; organizations: OrgInfo | null }>)
      .filter((m) => (m.role === "owner" || m.role === "admin") && m.organizations)
      .map((m) => ({
        id: m.organizations!.id,
        name: m.organizations!.name,
        slug: m.organizations!.slug,
        cover_photo_url: m.organizations!.cover_photo_url,
      }));

    const { data: teamMemberships } = await supabase
      .from("team_members")
      .select("team_id, role, teams(id, name, org_id)")
      .eq("user_id", user.id)
      .in("role", ["owner", "admin"]);
    const adminTeams = (teamMemberships || []) as Array<{ team_id: string; role: string; teams: { id: string; name: string; org_id: string | null } | null }>;

    if (adminOrgs.length === 0 && adminTeams.length === 0) {
      setLoading(false);
      return;
    }

    setAuthorized(true);
    const nextScopes: PeopleScope[] = [
      ...adminOrgs.map((org) => ({ key: `org:${org.id}`, type: "org" as const, id: org.id, label: org.name })),
      ...adminTeams.filter((m) => m.teams).map((m) => ({
        key: `team:${m.team_id}`,
        type: "team" as const,
        id: m.team_id,
        label: m.teams!.name,
        orgId: m.teams!.org_id,
      })),
    ];
    setScopes(nextScopes);
    setSelectedScopeKey(nextScopes[0]?.key || null);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadScopeMembers = useCallback(async (scopeKey: string) => {
    setOrgLoading(true);
    try {
      const [scopeType, scopeId] = scopeKey.split(":");
      const scope = scopes.find((item) => item.key === scopeKey);
      const orgId = scopeType === "org" ? scopeId : scope?.orgId;
      const { data: orgMembers } = await supabase
        .from(scopeType === "org" ? "org_members" : "team_members")
        .select("*")
        .eq(scopeType === "org" ? "org_id" : "team_id", scopeId)
        .order("joined_at", { ascending: true });

      if (!orgMembers) {
        setMembers([]);
        setStats({});
        setWorkload({});
        setOrgLoading(false);
        return;
      }

      const { data: profiles } = orgId
        ? await supabase.rpc("get_org_member_profiles", { p_org_id: orgId })
        : await supabase.from("user_profiles").select("user_id, display_name, avatar_url").in("user_id", (orgMembers || []).map((m: { user_id: string }) => m.user_id));

      const profileMap = new Map<string, { display_name: string; avatar_url: string | null; email: string }>();
      (profiles as { user_id: string; display_name: string; avatar_url: string | null; email: string }[] | null)?.forEach((p) => {
        profileMap.set(p.user_id, p);
      });

      const enriched: OrgMember[] = orgMembers.map((m: OrgMember & { team_id?: string }) => {
        const p = profileMap.get(m.user_id);
        return {
          ...m,
          org_id: m.org_id || orgId || "",
          display_name: p?.display_name || null,
          avatar_url: p?.avatar_url || null,
          email: p?.email || null,
          teams: [],
        };
      });

      const memberIds = enriched.map((m) => m.user_id);
      const { data: scopeTeams } = orgId
        ? await supabase.from("teams").select("id").eq("org_id", orgId)
        : { data: [{ id: scopeId }] };
      const scopeTeamIds = (scopeTeams || []).map((team: { id: string }) => team.id);
      const { data: teamRows } = memberIds.length > 0 && scopeTeamIds.length > 0
        ? await supabase.from("team_members").select("user_id, team_id, teams(name)").in("user_id", memberIds).in("team_id", scopeTeamIds)
        : { data: [] };
      const teamNames = new Map<string, string[]>();
      (teamRows || []).forEach((row: { user_id: string; teams: { name: string } | null }) => {
        if (!row.teams) return;
        teamNames.set(row.user_id, [...(teamNames.get(row.user_id) || []), row.teams.name]);
      });
      enriched.forEach((member) => { member.teams = teamNames.get(member.user_id) || []; });

      setMembers(enriched);

      const userIds = enriched.map((m) => m.user_id);
      if (userIds.length === 0) {
        setStats({});
        setWorkload({});
        setOrgLoading(false);
        return;
      }

      const today = new Date().toISOString();

      const [tasksRes, activitiesRes, meetingsRes, workloadRes] = await Promise.all([
        supabase
          .from("task_assignees")
          .select("user_id, tasks!inner(status, due_date)")
          .in("user_id", userIds),
        supabase
          .from("activities")
          .select("user_id, created_at")
          .in("user_id", userIds)
          .order("created_at", { ascending: false })
          .limit(200),
        fetch(scopeType === "org" ? `/api/people/meetings?org_id=${scopeId}` : `/api/people/meetings?team_id=${scopeId}`),
        fetch(scopeType === "org" ? `/api/people/workload?org_id=${scopeId}` : `/api/people/workload?team_id=${scopeId}`),
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

      let meetingsCounts: Record<string, number> = {};
      try {
        if (meetingsRes.ok) {
          const data = await meetingsRes.json();
          meetingsCounts = data.counts || {};
        }
      } catch {
        // ignore
      }

      const workloadCounts: Record<string, WorkloadStats> = {};
      try {
        if (workloadRes.ok) {
          const data = await workloadRes.json();
          (data.members || []).forEach((w: WorkloadStats) => { workloadCounts[w.user_id] = w; });
        }
      } catch {
        // ignore
      }
      setWorkload(workloadCounts);

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
          upcomingEvents: meetingsCounts[id] || 0,
          lastActivity: lastActivity[id] || null,
        };
      });
      setStats(next);
    } catch {
      // ignore
    } finally {
      setOrgLoading(false);
    }
  }, [scopes, supabase]);

  useEffect(() => {
    if (selectedScopeKey) void loadScopeMembers(selectedScopeKey);
  }, [selectedScopeKey, loadScopeMembers]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      (m.display_name || "").toLowerCase().includes(q) ||
      (m.email || "").toLowerCase().includes(q)
    );
  }, [members, search]);

  // Workload rows sorted by burden so overloaded members surface first.
  const workloadRows = useMemo(() => {
    return filteredMembers
      .map((m) => ({ member: m, w: workload[m.user_id] }))
      .filter((r): r is { member: OrgMember; w: WorkloadStats } => Boolean(r.w))
      .sort((a, b) => b.w.overdue - a.w.overdue || b.w.open - a.w.open);
  }, [filteredMembers, workload]);

  const maxOpen = useMemo(
    () => Math.max(1, ...Object.values(workload).map((x) => x.open)),
    [workload]
  );

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

       {/* Organization and team filter */}
       {scopes.length > 1 && (
         <div className="mb-6 flex items-center gap-2">
           <label htmlFor="people-scope" className="text-xs font-medium text-slate-500 dark:text-slate-400">View scope</label>
           <select
             id="people-scope"
             value={selectedScopeKey || ""}
             onChange={(e) => setSelectedScopeKey(e.target.value)}
             className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
           >
             {scopes.map((scope) => (
               <option key={scope.key} value={scope.key}>
                 {scope.type === "org" ? `${scope.label} (all teams)` : scope.label}
               </option>
             ))}
           </select>
         </div>
       )}

      {/* Workload summary */}
      {!orgLoading && Object.keys(workload).length > 0 && (
        <div className="mb-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <BarChart3 size={14} className="text-indigo-600" />
              Workload
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Open, in-progress, and overdue tasks per member
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-5 py-2.5 font-medium">Member</th>
                  <th className="px-3 py-2.5 font-medium">Open</th>
                  <th className="px-3 py-2.5 font-medium">In Progress</th>
                  <th className="px-3 py-2.5 font-medium">Overdue</th>
                  <th className="px-5 py-2.5 font-medium w-2/5">Open tasks</th>
                </tr>
              </thead>
              <tbody>
                {workloadRows.map(({ member, w }) => (
                  <tr key={member.user_id} className="border-b border-slate-50 dark:border-slate-800/60 last:border-0">
                    <td className="px-5 py-2.5 text-slate-900 dark:text-slate-100 font-medium whitespace-nowrap">
                      {member.display_name || member.email || "Unknown"}
                    </td>
                    <td className="px-3 py-2.5 text-slate-900 dark:text-slate-100">{w.open}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                        w.in_progress > 0
                          ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                          : "text-slate-400"
                      )}>
                        {w.in_progress}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                        w.overdue > 0
                          ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                          : "text-slate-400"
                      )}>
                        {w.overdue}
                      </span>
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            w.overdue > 0 ? "bg-red-500" : "bg-indigo-500"
                          )}
                          style={{ width: `${Math.round((w.open / maxOpen) * 100)}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
            const w = workload[member.user_id];
            // Prefer the timezone-aware workload API; fall back to the
            // client-side estimate if the API call failed.
            const active = w?.open ?? s?.activeTasks ?? 0;
            const overdue = w?.overdue ?? s?.overdueTasks ?? 0;
            const lastActive = s?.lastActivity ? new Date(s.lastActivity) : null;
            const lastActiveStr = lastActive
              ? lastActive.toLocaleDateString(undefined, { month: "short", day: "numeric" })
              : "Never";
            return (
              <Link
                key={member.id}
                href={`/people/${member.user_id}${member.org_id ? `?org=${member.org_id}` : ""}`}
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
                    <p className="text-base font-bold text-slate-900 dark:text-slate-100">{active}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">Active</p>
                  </div>
                  <div className={cn(
                    "rounded-lg py-2",
                    overdue > 0
                      ? "bg-red-50 dark:bg-red-900/20"
                      : "bg-slate-50 dark:bg-slate-800/50"
                  )}>
                    <p className={cn(
                      "text-base font-bold",
                      overdue > 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-slate-900 dark:text-slate-100"
                    )}>
                      {overdue}
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
                {member.teams && member.teams.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">Teams</p>
                    <div className="flex flex-wrap gap-1.5">
                      {member.teams.map((teamName) => (
                        <span key={teamName} className="max-w-full rounded-full bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                          <span className="block max-w-[13rem] truncate">{teamName}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
