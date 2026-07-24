"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CheckSquare, Calendar } from "lucide-react";
import Badge from "@/components/ui/Badge";
import { PRIORITY_CONFIG, type Task } from "@/lib/types";
import { checkDueDateNotifications } from "@/lib/dueDateChecker";

export default function MyTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "todo" | "in_progress" | "done">("all");
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("tasks")
        .select("*")
        .eq("assignee_id", user.id)
        .order("due_date", { ascending: true, nullsFirst: true });

      if (data) setTasks(data);
      setLoading(false);

      void checkDueDateNotifications();
    }
    void load();
  }, [supabase]);

  const filteredTasks = filter === "all" ? tasks : tasks.filter((t) => t.status === filter);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-slate-200 dark:border-slate-700 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">My Tasks</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Tasks assigned to you across all projects</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {(["all", "todo", "in_progress", "done"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400"
                : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            {f === "all" ? "All" : f === "in_progress" ? "In Progress" : f.charAt(0).toUpperCase() + f.slice(1)}
            <span className="ml-1.5 text-xs">
              ({f === "all" ? tasks.length : tasks.filter((t) => t.status === f).length})
            </span>
          </button>
        ))}
      </div>

      {filteredTasks.length === 0 ? (
        <div className="text-center py-16">
          <CheckSquare size={48} className="text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">
            {filter === "all" ? "No tasks assigned" : `No ${filter.replace("_", " ")} tasks`}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {filter === "all" ? "Ask your team to assign you some tasks" : "Try a different filter"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-4 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-indigo-300 dark:hover:border-indigo-500 transition-all"
            >
              <div
                className={`h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 ${
                  task.status === "done"
                    ? "bg-green-500 border-green-500"
                    : "border-slate-300 dark:border-slate-600"
                }`}
              >
                {task.status === "done" && (
                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-medium text-sm ${task.status === "done" ? "text-slate-400 dark:text-slate-500 line-through" : "text-slate-900 dark:text-slate-100"}`}>
                  {task.title}
                </p>
                {task.due_date && (
                  <div className="flex items-center gap-1 mt-1">
                    <Calendar size={12} className="text-slate-400 dark:text-slate-500" />
                    <span className="text-xs text-slate-400 dark:text-slate-500">{task.due_date}</span>
                  </div>
                )}
              </div>
              <Badge variant={
                task.priority === "urgent" ? "danger" :
                task.priority === "high" ? "warning" : "default"
              }>
                {PRIORITY_CONFIG[task.priority].label}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
