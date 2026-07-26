"use client";

import { useState } from "react";
import { ChevronDown, AlertTriangle, CheckCircle2, Clock, ListTodo } from "lucide-react";
import { type Task } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ProjectAnalyticsProps {
  tasks: Task[];
}

export default function ProjectAnalytics({ tasks }: ProjectAnalyticsProps) {
  const [expanded, setExpanded] = useState(true);

  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const todo = tasks.filter((t) => t.status === "todo").length;

  const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

  const today = new Date().toISOString().split("T")[0];
  const overdue = tasks.filter(
    (t) => t.due_date && t.due_date < today && t.status !== "done"
  ).length;

  const priorityCounts = {
    urgent: tasks.filter((t) => t.priority === "urgent").length,
    high: tasks.filter((t) => t.priority === "high").length,
    medium: tasks.filter((t) => t.priority === "medium").length,
    low: tasks.filter((t) => t.priority === "low").length,
  };

  const milestones = tasks.filter((t) => t.is_milestone);
  const milestonesDone = milestones.filter((t) => t.status === "done").length;
  const milestonesTotal = milestones.length;
  const milestoneRate = milestonesTotal > 0 ? Math.round((milestonesDone / milestonesTotal) * 100) : 0;

  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (completionRate / 100) * circumference;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mb-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
      >
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Project Analytics
        </span>
        <ChevronDown
          size={16}
          className={cn(
            "text-slate-400 transition-transform duration-200",
            expanded && "rotate-180"
          )}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard
              icon={<ListTodo size={16} />}
              label="Total"
              value={total}
              accent="text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20"
            />
            <MetricCard
              icon={<CheckCircle2 size={16} />}
              label="Done"
              value={done}
              accent="text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20"
            />
            <MetricCard
              icon={<Clock size={16} />}
              label="In Progress"
              value={inProgress}
              accent="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"
            />
            <MetricCard
              icon={<AlertTriangle size={16} />}
              label="Overdue"
              value={overdue}
              accent="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20"
            />
          </div>

          {/* Completion & Milestones Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Completion Rate */}
            <div className="flex items-center gap-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
              <div className="relative flex-shrink-0">
                <svg width="80" height="80" viewBox="0 0 80 80">
                  <circle
                    cx="40"
                    cy="40"
                    r={radius}
                    fill="none"
                    className="stroke-slate-200 dark:stroke-slate-700"
                    strokeWidth="6"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r={radius}
                    fill="none"
                    className="stroke-green-500 dark:stroke-green-400"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    transform="rotate(-90 40 40)"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-800 dark:text-slate-200">
                  {completionRate}%
                </span>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Completion Rate</p>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {done} of {total} tasks
                </p>
              </div>
            </div>

            {/* Milestone Progress */}
            <div className="flex items-center gap-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
              <div className="flex-shrink-0 flex flex-col items-center justify-center w-[80px] h-[80px]">
                <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {milestonesDone}/{milestonesTotal}
                </span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">milestones</span>
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Milestone Progress</p>
                <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 dark:bg-amber-400 rounded-full transition-all duration-300"
                    style={{ width: `${milestoneRate}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{milestoneRate}% complete</p>
              </div>
            </div>
          </div>

          {/* Priority Breakdown */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Priority Breakdown</p>
            <div className="flex h-3 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700">
              {total > 0 && (
                <>
                  {priorityCounts.urgent > 0 && (
                    <div
                      className="bg-red-500 dark:bg-red-400 transition-all duration-300"
                      style={{ width: `${(priorityCounts.urgent / total) * 100}%` }}
                      title={`Urgent: ${priorityCounts.urgent}`}
                    />
                  )}
                  {priorityCounts.high > 0 && (
                    <div
                      className="bg-orange-500 dark:bg-orange-400 transition-all duration-300"
                      style={{ width: `${(priorityCounts.high / total) * 100}%` }}
                      title={`High: ${priorityCounts.high}`}
                    />
                  )}
                  {priorityCounts.medium > 0 && (
                    <div
                      className="bg-blue-500 dark:bg-blue-400 transition-all duration-300"
                      style={{ width: `${(priorityCounts.medium / total) * 100}%` }}
                      title={`Medium: ${priorityCounts.medium}`}
                    />
                  )}
                  {priorityCounts.low > 0 && (
                    <div
                      className="bg-slate-400 dark:bg-slate-500 transition-all duration-300"
                      style={{ width: `${(priorityCounts.low / total) * 100}%` }}
                      title={`Low: ${priorityCounts.low}`}
                    />
                  )}
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-3 mt-2">
              <PriorityLegend color="bg-red-500 dark:bg-red-400" label="Urgent" count={priorityCounts.urgent} />
              <PriorityLegend color="bg-orange-500 dark:bg-orange-400" label="High" count={priorityCounts.high} />
              <PriorityLegend color="bg-blue-500 dark:bg-blue-400" label="Medium" count={priorityCounts.medium} />
              <PriorityLegend color="bg-slate-400 dark:bg-slate-500" label="Low" count={priorityCounts.low} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
      <div className={cn("p-1.5 rounded-md", accent)}>{icon}</div>
      <div>
        <p className="text-lg font-bold text-slate-800 dark:text-slate-200">{value}</p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500">{label}</p>
      </div>
    </div>
  );
}

function PriorityLegend({
  color,
  label,
  count,
}: {
  color: string;
  label: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={cn("w-2 h-2 rounded-full", color)} />
      <span className="text-[11px] text-slate-500 dark:text-slate-400">
        {label}: {count}
      </span>
    </div>
  );
}
