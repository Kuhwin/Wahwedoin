"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FolderKanban, Clock, AlertCircle, CheckCircle2, Plus, ChevronRight, ChevronDown } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { PROJECT_COLORS, type Project, type Task, type TeamMember, type Activity } from "@/lib/types";

interface TeamOverviewProps {
  teamId: string;
  members: TeamMember[];
  memberProfiles: Record<string, string>;
  memberAvatarUrls: Record<string, string>;
  memberEmails: Record<string, string>;
  autoOpenCreate?: boolean;
  onAutoOpenHandled?: () => void;
}

export default function TeamOverview({ teamId, members, memberProfiles, memberAvatarUrls, memberEmails, autoOpenCreate, onAutoOpenHandled }: TeamOverviewProps) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [allActivities, setAllActivities] = useState<Activity[]>([]);
  const [allUserNames, setAllUserNames] = useState<Record<string, string>>({});
  const [allActivitiesLoading, setAllActivitiesLoading] = useState(false);
  // Create-project (in-team) modal state
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createColor, setCreateColor] = useState<string>(PROJECT_COLORS[0]);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const supabase = createClient();

  // Open the create-project modal automatically when the parent signals
  // (e.g. the user followed the sidebar's "Add Project" link for this
  // team, which lands on /teams/<id>?action=add-project). One-shot via
  // onAutoOpenHandled so the modal doesn't reopen on re-renders.
  useEffect(() => {
    if (autoOpenCreate) {
      setShowCreateProject(true);
      onAutoOpenHandled?.();
    }
  }, [autoOpenCreate, onAutoOpenHandled]);

  const loadData = useCallback(async () => {
    const { data: projectsData } = await supabase
      .from("projects")
      .select("id, name, team_id, status, created_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

    if (projectsData) setProjects(projectsData as Project[]);

    const projectIds = (projectsData || []).map((p: { id: string }) => p.id);
    const projectIdStr = projectIds.length > 0 ? projectIds.join(",") : "00000000-0000-0000-0000-000000000000";

    const [tasksRes, actRes] = await Promise.all([
      projectIds.length > 0
        ? supabase
            .from("tasks")
            .select("id, project_id, title, status, priority, due_date, created_at, assignee_id")
            .in("project_id", projectIds)
        : Promise.resolve({ data: [] }),
      supabase
        .from("activities")
        .select("id, user_id, action, detail, created_at")
        .or(`team_id.eq.${teamId},project_id.in.(${projectIdStr})`)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    if (tasksRes.data) setTasks(tasksRes.data as Task[]);

    if (actRes.data) {
      setActivities(actRes.data as Activity[]);
      const userIds = [...new Set(actRes.data.map((a: Activity) => a.user_id).filter(Boolean))];
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
    setLoading(false);
  }, [teamId, supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Live refresh: subscribe to task changes so the stat counts (and
  // the projects/members/recent-activity lists) update when tasks are
  // created, updated, or deleted in any of the team's projects.
  useEffect(() => {
    const channel = supabase
      .channel(`team-overview-tasks-${teamId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        () => {
          void loadData();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [teamId, supabase, loadData]);

  async function loadAllActivities() {
    setAllActivitiesLoading(true);
    const { data: projectsData } = await supabase
      .from("projects")
      .select("id")
      .eq("team_id", teamId);
    const projectIds = (projectsData || []).map((p: { id: string }) => p.id);

    const { data } = await supabase
      .from("activities")
      .select("*")
      .or(`team_id.eq.${teamId},project_id.in.(${projectIds.join(",") || "00000000-0000-0000-0000-000000000000"})`)
      .order("created_at", { ascending: false });
    if (data) {
      setAllActivities(data);
      const userIds = [...new Set(data.map((a: Activity) => a.user_id).filter(Boolean))];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("user_profiles")
          .select("user_id, display_name")
          .in("user_id", userIds);
        if (profiles) {
          const map: Record<string, string> = {};
          profiles.forEach((p: { user_id: string; display_name: string }) => { map[p.user_id] = p.display_name; });
          setAllUserNames(map);
        }
      }
    }
    setAllActivitiesLoading(false);
    setShowAllActivities(true);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const today = new Date().toISOString().split("T")[0];
  const overdueTasks = tasks.filter((t) => t.due_date && t.due_date < today && t.status !== "done").length;

  // Create a new project in THIS team (no redirect to the global /projects
  // page). On success, navigate to the newly created project so the user
  // lands where they'd expect after creating one.
  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!createName.trim() || createSubmitting) return;
    setCreateSubmitting(true);
    setCreateError(null);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("projects")
      .insert({
        name: createName.trim(),
        description: createDesc.trim() || null,
        team_id: teamId,
        color: createColor,
        created_by: user?.id,
      })
      .select()
      .single();
    if (error || !data) {
      setCreateError(error?.message || "Failed to create project.");
      setCreateSubmitting(false);
      return;
    }
    setShowCreateProject(false);
    setCreateName("");
    setCreateDesc("");
    setCreateError(null);
    setCreateSubmitting(false);
    router.push(`/projects/${data.id}`);
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <FolderKanban size={16} className="text-indigo-600" />
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Projects</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{projects.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={16} className="text-green-600" />
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Done</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {doneTasks}<span className="text-sm text-slate-400 font-normal">/{totalTasks}</span>
          </p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={16} className="text-blue-600" />
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Active</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{totalTasks - doneTasks}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={16} className="text-red-600" />
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Overdue</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{overdueTasks}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Projects */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Projects</h3>
            <button
              type="button"
              onClick={() => { setCreateError(null); setShowCreateProject(true); }}
              className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80"
            >
              <Plus size={12} />
              Add Project
            </button>
          </div>
          {projects.length === 0 ? (
            <div className="text-sm text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 text-center">
              <p className="mb-3">No projects yet</p>
              <button
                type="button"
                onClick={() => { setCreateError(null); setShowCreateProject(true); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-accent/15 transition-colors"
              >
                <Plus size={12} />
                Create Project
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {projects.map((project) => {
                const projectTasks = tasks.filter((t) => t.project_id === project.id);
                const completed = projectTasks.filter((t) => t.status === "done").length;
                const total = projectTasks.length;
                const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

                return (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-accent/30 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: project.color }}
                      />
                      <div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">{project.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{completed}/{total} tasks</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-24">
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: project.color }}
                          />
                        </div>
                      </div>
                      <span className="text-xs text-slate-400 w-8 text-right">{pct}%</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Members & Activity */}
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Members ({members.length})</h3>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-700">
              {members.map((member) => (
                <div key={member.id} className="flex items-center gap-3 p-3">
                  <Avatar
                    name={memberProfiles[member.user_id]}
                    email={memberEmails[member.user_id] || member.user_id}
                    avatarUrl={memberAvatarUrls[member.user_id]}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {memberProfiles[member.user_id] || memberEmails[member.user_id] || "Unknown"}
                    </p>
                  </div>
                  <Badge variant={member.role === "owner" ? "info" : "default"}>
                    {member.role}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Recent Activity</h3>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-700">
              {activities.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">No activity yet</p>
              ) : (
                <>
                  {(showAllActivities ? allActivities : activities).map((act) => (
                    <div key={act.id} className="p-3">
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        <span className="font-medium">{(showAllActivities ? allUserNames : userNames)[act.user_id] || "Someone"}</span>
                        {" "}{act.action}
                        {act.detail && <span className="font-medium"> {act.detail}</span>}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                        {new Date(act.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    </div>
                  ))}
                  {!showAllActivities ? (
                    <button
                      onClick={() => void loadAllActivities()}
                      disabled={allActivitiesLoading}
                      className="w-full p-3 text-sm font-medium text-indigo-600 hover:bg-indigo-50 transition-colors flex items-center justify-center gap-1"
                    >
                      {allActivitiesLoading ? "Loading..." : "View all activity"}
                      <ChevronRight size={14} />
                    </button>
                  ) : allActivities.length > 7 && (
                    <button
                      onClick={() => setShowAllActivities(false)}
                      className="w-full p-3 text-sm font-medium text-slate-500 hover:bg-slate-50 transition-colors flex items-center justify-center gap-1"
                    >
                      Show less <ChevronDown size={14} />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Create Project (in-team) modal */}
      <Modal
        open={showCreateProject}
        onClose={() => { if (!createSubmitting) { setShowCreateProject(false); setCreateError(null); } }}
        title="Create Project"
      >
        <form onSubmit={handleCreateProject} className="space-y-4">
          {createError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {createError}
            </div>
          )}
          <Input
            label="Project Name"
            placeholder="e.g. Beach Cleanup Drive"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            required
          />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">Description</label>
            <textarea
              placeholder="What is this project about?"
              value={createDesc}
              onChange={(e) => setCreateDesc(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 resize-none"
              rows={3}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">Team</label>
            <div className="block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              This project will be created in the current team.
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">Colour</label>
            <div className="flex gap-2">
              {PROJECT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setCreateColor(color)}
                  className={`h-8 w-8 rounded-lg transition-all ${createColor === color ? "ring-2 ring-offset-2 ring-indigo-500" : ""}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => { setShowCreateProject(false); setCreateError(null); }} disabled={createSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={createSubmitting || !createName.trim()}>
              {createSubmitting ? "Creating..." : "Create Project"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
