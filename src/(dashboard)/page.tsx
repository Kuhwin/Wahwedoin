"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  FolderKanban,
  CheckSquare,
  Calendar,
  Users,
  ArrowRight,
  Clock,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import type { Project, Task } from "@/lib/types";

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: projectsData } = await supabase
          .from("projects")
          .select("*")
          .order("created_at", { ascending: false });

        if (projectsData) setProjects(projectsData);

        const { data: tasksData } = await supabase
          .from("tasks")
          .select("*")
          .order("created_at", { ascending: false });

        if (tasksData) setTasks(tasksData);
      } catch {
        // Tables might not exist yet
      }
      setLoading(false);
    }
    void load();
  }, [supabase]);

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const activeTasks = tasks.filter((t) => t.status === "in_progress").length;
  const today = new Date().toISOString().split("T")[0];
  const overdueTasks = tasks.filter((t) => t.due_date && t.due_date < today && t.status !== "done").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Overview of all your projects and tasks</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
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
          <p className="text-2xl font-bold text-slate-900">{activeTasks}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={16} className="text-red-600" />
            <span className="text-xs font-medium text-slate-500">Overdue</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{overdueTasks}</p>
        </div>
      </div>

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

      {/* Recent Projects */}
      {projects.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Recent Projects</h2>
            <Link href="/projects" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {projects.slice(0, 5).map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-indigo-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: project.color }}
                  />
                  <div>
                    <p className="font-medium text-slate-900">{project.name}</p>
                    <p className="text-xs text-slate-500">{project.status}</p>
                  </div>
                </div>
                <ArrowRight size={14} className="text-slate-300" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
