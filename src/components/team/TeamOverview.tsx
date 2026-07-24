"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { FolderKanban, Clock, AlertCircle, CheckCircle2, Plus } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import { type Project, type Task, type TeamMember, type Activity } from "@/lib/types";

interface TeamOverviewProps {
  teamId: string;
  members: TeamMember[];
  memberProfiles: Record<string, string>;
  memberAvatarUrls: Record<string, string>;
}

export default function TeamOverview({ teamId, members, memberProfiles, memberAvatarUrls }: TeamOverviewProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const loadData = useCallback(async () => {
    const { data: projectsData } = await supabase
      .from("projects")
      .select("*")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

    if (projectsData) {
      setProjects(projectsData);
      const projectIds = projectsData.map((p: Project) => p.id);
      if (projectIds.length > 0) {
        const { data: tasksData } = await supabase
          .from("tasks")
          .select("*")
          .in("project_id", projectIds);
        if (tasksData) setTasks(tasksData);
      }
    }

    const { data: actData } = await supabase
      .from("activities")
      .select("*")
      .or(`team_id.eq.${teamId},project_id.in.(${(projectsData || []).map((p: Project) => p.id).join(",") || "00000000-0000-0000-0000-000000000000"})`)
      .order("created_at", { ascending: false })
      .limit(10);

    if (actData) {
      setActivities(actData);
      const userIds = [...new Set(actData.map((a: Activity) => a.user_id).filter(Boolean))];
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

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
            <span className="text-xs font-medium text-slate-500">Active</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{totalTasks - doneTasks}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={16} className="text-red-600" />
            <span className="text-xs font-medium text-slate-500">Overdue</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{overdueTasks}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Projects */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700">Projects</h3>
            <Link
              href={`/projects?team=${teamId}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              <Plus size={12} />
              Add Project
            </Link>
          </div>
          {projects.length === 0 ? (
            <div className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-6 text-center">
              <p className="mb-3">No projects yet</p>
              <Link
                href={`/projects?team=${teamId}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
              >
                <Plus size={12} />
                Create Project
              </Link>
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
                    className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-indigo-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: project.color }}
                      />
                      <div>
                        <p className="font-medium text-slate-900">{project.name}</p>
                        <p className="text-xs text-slate-500">{completed}/{total} tasks</p>
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
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Members ({members.length})</h3>
            <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
              {members.map((member) => (
                <div key={member.id} className="flex items-center gap-3 p-3">
                  <Avatar
                    name={memberProfiles[member.user_id]}
                    email={member.user_email || member.user_id}
                    avatarUrl={memberAvatarUrls[member.user_id]}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {memberProfiles[member.user_id] || member.user_email || "Unknown"}
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
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Recent Activity</h3>
            <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
              {activities.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No activity yet</p>
              ) : (
                activities.map((act) => (
                  <div key={act.id} className="p-3">
                    <p className="text-sm text-slate-700">
                      <span className="font-medium">{userNames[act.user_id] || "Someone"}</span>
                      {" "}{act.action}
                      {act.detail && <span className="font-medium"> {act.detail}</span>}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {new Date(act.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
