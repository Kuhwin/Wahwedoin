"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Target, Plus, Trash2, Pencil, Link2, CheckCircle2, Flag } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Badge from "@/components/ui/Badge";
import Avatar from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { type Goal, type Project } from "@/lib/types";

interface OrgInfo {
  id: string;
  name: string;
  slug: string;
}

interface TeamInfo {
  id: string;
  name: string;
  org_id: string | null;
}

interface MemberProfile {
  user_id: string;
  display_name: string;
  user_email: string;
}

interface GoalLink {
  goal_id: string;
  project_id: string;
  projects: Project;
}

const STATUS_CONFIG: Record<Goal["status"], { label: string; variant: "success" | "warning" | "danger" | "default" }> = {
  on_track: { label: "On track", variant: "success" },
  at_risk: { label: "At risk", variant: "warning" },
  behind: { label: "Behind", variant: "danger" },
  complete: { label: "Complete", variant: "default" },
};

export default function GoalsPage() {
  const [goals, setGoals] = useState<(Goal & { scope_label?: string })[]>([]);
  const [orgs, setOrgs] = useState<OrgInfo[]>([]);
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [form, setForm] = useState<{
    name: string;
    description: string;
    scope: "org" | "team";
    org_id: string;
    team_id: string;
    owner_id: string;
    status: Goal["status"];
    due_date: string;
  }>({ name: "", description: "", scope: "team", org_id: "", team_id: "", owner_id: "", status: "on_track", due_date: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Goal | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [goalLinks, setGoalLinks] = useState<GoalLink[]>([]);
  const [availableProjects, setAvailableProjects] = useState<Project[]>([]);
  const [showAddProject, setShowAddProject] = useState(false);
  const [selectedGoalForProjects, setSelectedGoalForProjects] = useState<Goal | null>(null);
  const supabase = createClient();

  const loadGoals = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [orgRes, teamRes, memberRes] = await Promise.all([
      supabase.from("org_members").select("org_id, organizations(id, name, slug)"),
      supabase.from("team_members").select("team_id, teams(id, name, org_id)"),
      supabase.from("user_profiles").select("user_id, display_name").neq("user_id", user.id),
    ]);

    const orgList = ((orgRes.data || []) as { org_id: string; organizations: OrgInfo | null }[])
      .filter((m) => m.organizations)
      .map((m) => m.organizations!);
    const teamList = ((teamRes.data || []) as { team_id: string; teams: TeamInfo | null }[])
      .filter((m) => m.teams)
      .map((m) => m.teams!);

    setOrgs(orgList);
    setTeams(teamList);
    setMembers((memberRes.data || []) as MemberProfile[]);

    const orgIds = orgList.map((o) => o.id);
    const teamIds = teamList.map((t) => t.id);

    let query = supabase.from("goals").select("*").order("created_at", { ascending: false });
    const orClauses: string[] = [];
    if (orgIds.length > 0) orClauses.push(`organization_id.in.(${orgIds.join(",")})`);
    if (teamIds.length > 0) orClauses.push(`team_id.in.(${teamIds.join(",")})`);
    orClauses.push(`owner_id.eq.${user.id}`);
    query = query.or(orClauses.join(","));

    const { data: goalData } = await query;

    if (goalData) {
      const scopeLabel = (g: Goal) => {
        if (g.team_id) return `Team · ${teamList.find((t) => t.id === g.team_id)?.name || "Unknown"}`;
        if (g.organization_id) return `Org · ${orgList.find((o) => o.id === g.organization_id)?.name || "Unknown"}`;
        return "Personal";
      };

      const enriched = await Promise.all(
        (goalData as Goal[]).map(async (g) => {
          const { data: links } = await supabase
            .from("goal_projects")
            .select("project_id, projects(id, name, team_id, status, color)")
            .eq("goal_id", g.id);

          const projects = (links || []) as unknown as { project_id: string; projects: Project }[];
          const projectIds = projects.map((l) => l.project_id);

          let totalTasks = 0;
          let completedTasks = 0;
          if (projectIds.length > 0) {
            const { data: tasks } = await supabase
              .from("tasks")
              .select("status")
              .in("project_id", projectIds);
            totalTasks = (tasks || []).length;
            completedTasks = (tasks || []).filter((t: { status: string }) => t.status === "done").length;
          }

          const owner = g.owner_id ? (memberRes.data || []).find((m: { user_id: string }) => m.user_id === g.owner_id) : null;

          return {
            ...g,
            scope_label: scopeLabel(g),
            project_ids: projectIds,
            project_count: projectIds.length,
            total_tasks: totalTasks,
            completed_tasks: completedTasks,
            owner_name: owner?.display_name || undefined,
          };
        })
      );

      setGoals(enriched);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadGoals();
  }, [loadGoals]);

  function openCreate() {
    setEditingGoal(null);
    setForm({
      name: "",
      description: "",
      scope: orgs.length > 0 && teams.length === 0 ? "org" : "team",
      org_id: orgs[0]?.id || "",
      team_id: teams[0]?.id || "",
      owner_id: "",
      status: "on_track",
      due_date: "",
    });
    setError(null);
    setShowCreate(true);
  }

  function openEdit(g: Goal) {
    setEditingGoal(g);
    setForm({
      name: g.name,
      description: g.description || "",
      scope: g.team_id ? "team" : "org",
      org_id: g.organization_id || orgs[0]?.id || "",
      team_id: g.team_id || teams[0]?.id || "",
      owner_id: g.owner_id || "",
      status: g.status,
      due_date: g.due_date || "",
    });
    setError(null);
    setShowCreate(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    const base = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      owner_id: form.owner_id || null,
      status: form.status,
      due_date: form.due_date || null,
    };

    if (editingGoal) {
      const { error: err } = await supabase
        .from("goals")
        .update({
          ...base,
          organization_id: form.scope === "org" ? form.org_id || null : null,
          team_id: form.scope === "team" ? form.team_id || null : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingGoal.id);
      if (err) {
        setError(err.message || "Failed to update goal");
        setSaving(false);
        return;
      }
    } else {
      const { error: err } = await supabase
        .from("goals")
        .insert({
          ...base,
          organization_id: form.scope === "org" ? form.org_id || null : null,
          team_id: form.scope === "team" ? form.team_id || null : null,
          created_by: user?.id,
        });
      if (err) {
        setError(err.message || "Failed to create goal");
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setShowCreate(false);
    setMessage({ type: "success", text: editingGoal ? "Goal updated" : "Goal created" });
    setTimeout(() => setMessage(null), 3000);
    void loadGoals();
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    const { error: err } = await supabase.from("goals").delete().eq("id", confirmDelete.id);
    setConfirmDelete(null);
    if (err) {
      setMessage({ type: "error", text: err.message || "Failed to delete goal" });
      setTimeout(() => setMessage(null), 3000);
      return;
    }
    setMessage({ type: "success", text: "Goal deleted" });
    setTimeout(() => setMessage(null), 3000);
    void loadGoals();
  }

  async function openGoal(g: Goal) {
    setSelectedGoal(g);
    setGoalLinks([]);
    const { data: links } = await supabase
      .from("goal_projects")
      .select("goal_id, project_id, projects(id, name, team_id, status, color)")
      .eq("goal_id", g.id);
    setGoalLinks(((links || []) as unknown as GoalLink[]));
  }

  async function openLinkProjects(g: Goal) {
    setSelectedGoalForProjects(g);
    setAvailableProjects([]);
    const { data: linked } = await supabase
      .from("goal_projects")
      .select("project_id")
      .eq("goal_id", g.id);
    const linkedIds = new Set(((linked || []) as { project_id: string }[]).map((l) => l.project_id));

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: memberships } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", user.id);
    const teamIds = ((memberships || []) as { team_id: string }[]).map((m) => m.team_id);
    if (teamIds.length === 0) return;

    const { data: projects } = await supabase
      .from("projects")
      .select("id, name, team_id, status, color")
      .in("team_id", teamIds)
      .order("name");
    setAvailableProjects(((projects || []) as Project[]).filter((p) => !linkedIds.has(p.id)));
    setShowAddProject(true);
  }

  async function handleLinkProject(projectId: string) {
    if (!selectedGoalForProjects) return;
    const { error: err } = await supabase
      .from("goal_projects")
      .insert({ goal_id: selectedGoalForProjects.id, project_id: projectId });
    if (!err) {
      setShowAddProject(false);
      setSelectedGoalForProjects(null);
      void loadGoals();
      if (selectedGoal?.id === selectedGoalForProjects.id) void openGoal(selectedGoalForProjects);
    }
  }

  async function handleUnlinkProject(goalId: string, projectId: string) {
    const { error: err } = await supabase
      .from("goal_projects")
      .delete()
      .eq("goal_id", goalId)
      .eq("project_id", projectId);
    if (!err) {
      void loadGoals();
      if (selectedGoal?.id === goalId) void openGoal(selectedGoal);
    }
  }

  function getMemberName(userId: string | null) {
    if (!userId) return "Unassigned";
    const m = members.find((x) => x.user_id === userId);
    if (m?.display_name) return m.display_name;
    if (m?.user_email) return m.user_email.split("@")[0];
    return userId.slice(0, 8);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Target className="text-accent" />
            Goals
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Track key objectives for your teams and organizations.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} /> New Goal
        </Button>
      </div>

      {message && (
        <div className={cn(
          "mb-4 px-4 py-3 rounded-xl text-sm",
          message.type === "success"
            ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800"
            : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800"
        )}>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 animate-pulse">
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/3 mb-3" />
              <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-full mb-2" />
              <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : goals.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-10 text-center">
          <Target size={32} className="text-slate-300 dark:text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-500 dark:text-slate-400">No goals yet</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 mb-4">Create a goal to track progress toward what matters.</p>
          <Button onClick={openCreate}><Plus size={16} /> New Goal</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {goals.map((g) => {
            const status = STATUS_CONFIG[g.status];
            const pct = g.total_tasks && g.total_tasks > 0
              ? Math.round(((g.completed_tasks || 0) / g.total_tasks) * 100)
              : 0;
            const overdue = g.due_date && g.status !== "complete" && new Date(g.due_date) < new Date(new Date().toDateString());
            return (
              <div
                key={g.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 hover:border-accent/50 hover:shadow-md transition-all cursor-pointer group"
                onClick={() => void openGoal(g)}
              >
                <div className="flex items-start justify-between mb-2">
                  <Badge variant={status.variant}>{status.label}</Badge>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); openEdit(g); }}
                      className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(g); }}
                      className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-600"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1 group-hover:text-accent transition-colors">
                  {g.name}
                </h3>
                {g.description && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-3">{g.description}</p>
                )}

                <div className="flex items-center gap-2 mb-3">
                  <Avatar name={getMemberName(g.owner_id)} email={g.owner_id || ""} size="xs" />
                  <span className="text-xs text-slate-600 dark:text-slate-300">{getMemberName(g.owner_id)}</span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">{g.scope_label}</span>
                </div>

                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <CheckCircle2 size={12} /> {g.completed_tasks || 0}/{g.total_tasks || 0} tasks
                  </span>
                  {g.due_date && (
                    <span className={cn("flex items-center gap-1", overdue ? "text-red-600 dark:text-red-400 font-medium" : "text-slate-500 dark:text-slate-400")}>
                      <Flag size={12} />
                      {new Date(g.due_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                  )}
                </div>
                <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                  <Link2 size={12} /> {g.project_count || 0} linked project{(g.project_count || 0) === 1 ? "" : "s"}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title={editingGoal ? "Edit Goal" : "New Goal"}>
        <form onSubmit={handleSave} className="space-y-4">
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Launch new product" required />
          <Input label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What does success look like?" />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Scope</label>
              <select
                value={form.scope}
                onChange={(e) => setForm({ ...form, scope: e.target.value as "org" | "team" })}
                className="block w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-accent/50"
              >
                <option value="team">Team</option>
                <option value="org">Organization</option>
              </select>
            </div>
            {form.scope === "team" ? (
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Team</label>
                <select
                  value={form.team_id}
                  onChange={(e) => setForm({ ...form, team_id: e.target.value })}
                  className="block w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-accent/50"
                >
                  {teams.length === 0 && <option value="">No teams</option>}
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Organization</label>
                <select
                  value={form.org_id}
                  onChange={(e) => setForm({ ...form, org_id: e.target.value })}
                  className="block w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-accent/50"
                >
                  {orgs.length === 0 && <option value="">No organizations</option>}
                  {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Owner</label>
              <select
                value={form.owner_id}
                onChange={(e) => setForm({ ...form, owner_id: e.target.value })}
                className="block w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-accent/50"
              >
                <option value="">Unassigned</option>
                {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name || m.user_email}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as Goal["status"] })}
                className="block w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-accent/50"
              >
                <option value="on_track">On track</option>
                <option value="at_risk">At risk</option>
                <option value="behind">Behind</option>
                <option value="complete">Complete</option>
              </select>
            </div>
          </div>

          <Input label="Due Date" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || (form.scope === "team" && !form.team_id) || (form.scope === "org" && !form.org_id)}>
              {saving ? "Saving..." : editingGoal ? "Save Changes" : "Create Goal"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirm */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete Goal">
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
          Delete &quot;{confirmDelete?.name}&quot;? This will also remove its project links. This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button onClick={() => void handleDelete()}>Delete</Button>
        </div>
      </Modal>

      {/* Goal Detail Modal */}
      <Modal open={!!selectedGoal} onClose={() => setSelectedGoal(null)} title={selectedGoal?.name || ""}>
        {selectedGoal && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge variant={STATUS_CONFIG[selectedGoal.status].variant}>{STATUS_CONFIG[selectedGoal.status].label}</Badge>
              {selectedGoal.due_date && (
                <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Flag size={12} /> Due {new Date(selectedGoal.due_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              )}
            </div>
            {selectedGoal.description && (
              <p className="text-sm text-slate-600 dark:text-slate-400">{selectedGoal.description}</p>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Owner: <span className="font-medium text-slate-700 dark:text-slate-300">{getMemberName(selectedGoal.owner_id)}</span>
            </p>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Linked Projects ({goalLinks.length})</h4>
                <Button onClick={() => void openLinkProjects(selectedGoal)}>
                  <Link2 size={14} /> Link Project
                </Button>
              </div>
              {goalLinks.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-500 italic">No linked projects</p>
              ) : (
                <div className="space-y-1.5">
                  {goalLinks.map((l) => (
                    <div key={l.project_id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 group">
                      <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: l.projects.color || "#6366f1" }} />
                      <span className="text-sm text-slate-900 dark:text-slate-100 truncate flex-1">{l.projects.name}</span>
                      <Badge variant={l.projects.status === "completed" ? "success" : "default"}>
                        {l.projects.status === "completed" ? "Complete" : l.projects.status}
                      </Badge>
                      <button
                        onClick={() => void handleUnlinkProject(selectedGoal.id, l.project_id)}
                        className="p-1 rounded text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Unlink"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Link Project Modal */}
      <Modal open={showAddProject} onClose={() => setShowAddProject(false)} title={`Link projects to "${selectedGoalForProjects?.name}"`}>
        <div className="max-h-80 overflow-y-auto space-y-1">
          {availableProjects.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 italic py-4 text-center">No unlinked projects available</p>
          ) : (
            availableProjects.map((p) => (
              <button
                key={p.id}
                onClick={() => void handleLinkProject(p.id)}
                className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-left transition-colors"
              >
                <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color || "#6366f1" }} />
                <span className="text-sm text-slate-900 dark:text-slate-100 truncate flex-1">{p.name}</span>
                <Plus size={14} className="text-slate-400" />
              </button>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
}
