"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { CheckSquare, Calendar, Bookmark, BookmarkCheck, X, ChevronDown, ArrowUpDown, Layers } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { checkTaskReminders } from "@/lib/taskReminderChecker";
import { PRIORITY_CONFIG, type Task, type SavedView } from "@/lib/types";

type FilterState = {
  status: string;
  priority: string;
  project_id: string;
  due_before: string;
};

const EMPTY_FILTERS: FilterState = { status: "all", priority: "all", project_id: "all", due_before: "all" };

export default function MyTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [sortBy, setSortBy] = useState("due_date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [activeView, setActiveView] = useState<string | null>(null);
  const [viewName, setViewName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [groupBy, setGroupBy] = useState<"none" | "project">("none");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const supabase = createClient();

  const loadTasks = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: directTasks }, { data: linkedTasks }] = await Promise.all([
      supabase.from("tasks").select("id").eq("assignee_id", user.id),
      supabase.from("task_assignees").select("task_id").eq("user_id", user.id),
    ]);
    const taskIds = [...new Set([
      ...(directTasks || []).map((task: { id: string }) => task.id),
      ...(linkedTasks || []).map((task: { task_id: string }) => task.task_id),
    ])];

    if (taskIds.length === 0) {
      setTasks([]);
      setLoading(false);
      return;
    }

    let query = supabase
      .from("tasks")
      .select("*, projects!inner(id, name)")
      .in("id", taskIds);

    if (filters.status !== "all") query = query.eq("status", filters.status);
    if (filters.priority !== "all") query = query.eq("priority", filters.priority);
    if (filters.project_id !== "all") query = query.eq("project_id", filters.project_id);
    if (filters.due_before === "today") {
      const today = new Date().toISOString().split("T")[0];
      query = query.lte("due_date", today).eq("status", "todo");
    } else if (filters.due_before === "week") {
      const week = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
      query = query.lte("due_date", week);
    } else if (filters.due_before === "overdue") {
      const today = new Date().toISOString().split("T")[0];
      query = query.lt("due_date", today).neq("status", "done");
    }

    const ascending = sortBy === "due_date" ? sortOrder === "asc" : sortOrder === "asc";
    query = query.order(sortBy, { ascending, nullsFirst: sortBy === "due_date" });

    const { data } = await query;
    if (data) setTasks(data);
    setLoading(false);
  }, [supabase, filters, sortBy, sortOrder]);

  useEffect(() => {
    void loadTasks();
    void checkTaskReminders();
  }, [loadTasks]);

  useEffect(() => {
    async function loadMeta() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

       const [viewsRes, directProjectsRes, linkedProjectsRes] = await Promise.all([
         supabase.from("saved_views").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
         supabase.from("tasks").select("id, project_id").eq("assignee_id", user.id),
         supabase.from("task_assignees").select("task_id").eq("user_id", user.id),
       ]);

      if (viewsRes.data) setSavedViews(viewsRes.data);

       const linkedTaskIds = (linkedProjectsRes.data || []).map((t: { task_id: string }) => t.task_id);
       let linkedProjectIds: string[] = [];
       if (linkedTaskIds.length > 0) {
         const { data: linkedTasks } = await supabase.from("tasks").select("project_id").in("id", linkedTaskIds);
         linkedProjectIds = (linkedTasks || []).map((t: { project_id: string }) => t.project_id);
       }
       const uniqueIds = [...new Set([
         ...(directProjectsRes.data || []).map((t: { project_id: string }) => t.project_id),
         ...linkedProjectIds,
       ].filter(Boolean))];
      if (uniqueIds.length > 0) {
        const { data: projData } = await supabase.from("projects").select("id, name").in("id", uniqueIds);
        if (projData) setProjects(projData);
      }
    }
    void loadMeta();
  }, [supabase]);

  function updateFilter(key: keyof FilterState, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setActiveView(null);
  }

  async function saveView() {
    if (!viewName.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("saved_views")
      .insert({
        user_id: user.id,
        name: viewName.trim(),
        filters,
        sort_by: sortBy,
        sort_order: sortOrder,
      })
      .select()
      .single();

    if (data && !error) {
      setSavedViews([data, ...savedViews]);
      setActiveView(data.id);
      setViewName("");
      setShowSaveInput(false);
    }
  }

  async function loadView(view: SavedView) {
    setFilters(view.filters as FilterState);
    setSortBy(view.sort_by);
    setSortOrder(view.sort_order as "asc" | "desc");
    setActiveView(view.id);
  }

  async function deleteView(viewId: string) {
    await supabase.from("saved_views").delete().eq("id", viewId);
    setSavedViews(savedViews.filter((v) => v.id !== viewId));
    if (activeView === viewId) setActiveView(null);
  }

  const hasActiveFilters = Object.entries(filters).some(([k, v]) => {
    if (k === "status") return v !== "all";
    if (k === "priority") return v !== "all";
    if (k === "project_id") return v !== "all";
    return v !== "all";
  });

  const filteredTasks = tasks;

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

      {/* Saved Views */}
      {savedViews.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {savedViews.map((view) => (
            <button
              key={view.id}
              onClick={() => void loadView(view)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors group ${
                activeView === view.id
                  ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {activeView === view.id ? <BookmarkCheck size={12} /> : <Bookmark size={12} />}
              {view.name}
              <button
                onClick={(e) => { e.stopPropagation(); void deleteView(view.id); }}
                className="opacity-0 group-hover:opacity-100 ml-0.5 text-slate-400 hover:text-red-500 transition-opacity"
              >
                <X size={10} />
              </button>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={filters.status}
          onChange={(e) => updateFilter("status", e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-accent/50"
        >
          <option value="all">All Status</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>

        <select
          value={filters.priority}
          onChange={(e) => updateFilter("priority", e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-accent/50"
        >
          <option value="all">All Priority</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {projects.length > 0 && (
          <select
            value={filters.project_id}
            onChange={(e) => updateFilter("project_id", e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-accent/50"
          >
            <option value="all">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}

        <select
          value={filters.due_before}
          onChange={(e) => updateFilter("due_before", e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-accent/50"
        >
          <option value="all">Any Due Date</option>
          <option value="overdue">Overdue</option>
          <option value="today">Due Today</option>
          <option value="week">Due This Week</option>
        </select>

        <div className="flex items-center gap-1">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-accent/50"
          >
            <option value="due_date">Due Date</option>
            <option value="priority">Priority</option>
            <option value="created_at">Created</option>
            <option value="title">Title</option>
          </select>
          <button
            onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            <ArrowUpDown size={14} />
          </button>
        </div>

        <button
          onClick={() => {
            const next = groupBy === "none" ? "project" : "none";
            setGroupBy(next);
            if (next === "project") {
              const allGroups = new Set(filteredTasks.map((t) => (t as { projects?: { name: string } }).projects?.name ?? "No Project"));
              setExpandedGroups(allGroups);
            }
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            groupBy === "project"
              ? "border-accent/30 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400"
              : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          <Layers size={12} />
          {groupBy === "project" ? "By Project" : "Flat"}
        </button>

        {hasActiveFilters && (
          <button
            onClick={() => { setFilters(EMPTY_FILTERS); setActiveView(null); }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <X size={12} /> Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {showSaveInput ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                placeholder="View name"
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void saveView(); if (e.key === "Escape") setShowSaveInput(false); }}
                className="w-32 px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-accent/50"
                autoFocus
              />
              <Button size="sm" className="text-xs h-7" onClick={() => void saveView()}>Save</Button>
              <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setShowSaveInput(false)}>Cancel</Button>
            </div>
          ) : (
            <button
              onClick={() => setShowSaveInput(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Bookmark size={12} /> Save View
            </button>
          )}
        </div>
      </div>

      {/* Task count */}
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
        {filteredTasks.length} task{filteredTasks.length !== 1 ? "s" : ""}
      </p>

      {filteredTasks.length === 0 ? (
        <div className="text-center py-16">
          <CheckSquare size={48} className="text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">
            {hasActiveFilters ? "No matching tasks" : "No tasks assigned"}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {hasActiveFilters ? "Try adjusting your filters" : "Ask your team to assign you some tasks"}
          </p>
        </div>
      ) : groupBy === "project" ? (
        <div className="space-y-4">
          {(() => {
            const groups = new Map<string, { colour: string | null; tasks: typeof filteredTasks }>();
            for (const task of filteredTasks) {
              const proj = (task as { projects?: { name: string; colour?: string } }).projects;
              const key = proj?.name ?? "No Project";
              const colour = proj?.colour ?? null;
              const existing = groups.get(key);
              if (existing) {
                existing.tasks.push(task);
              } else {
                groups.set(key, { colour, tasks: [task] });
              }
            }
            const toggle = (key: string) => {
              setExpandedGroups((prev) => {
                const next = new Set(prev);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
              });
            };
            return Array.from(groups.entries()).map(([name, { colour, tasks: groupTasks }]) => {
              const isExpanded = expandedGroups.has(name);
              return (
                <div key={name}>
                  <button
                    onClick={() => toggle(name)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors mb-2"
                  >
                    <ChevronDown
                      size={14}
                      className={`text-slate-400 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
                    />
                    {colour ? (
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: colour }} />
                    ) : (
                      <span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0" />
                    )}
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{name}</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">{groupTasks.length}</span>
                  </button>
                  {isExpanded && (
                    <div className="space-y-2 ml-2">
                      {groupTasks.map((task) => (
                        <div
                          key={task.id}
                          className="flex items-center gap-4 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-accent/50 transition-all"
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
                            <div className="flex items-center gap-3 mt-1">
                              {task.due_date && (
                                <div className="flex items-center gap-1">
                                  <Calendar size={12} className="text-slate-400 dark:text-slate-500" />
                                  <span className="text-xs text-slate-400 dark:text-slate-500">{task.due_date}</span>
                                </div>
                              )}
                            </div>
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
            });
          })()}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-4 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-accent/50 transition-all"
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
                <div className="flex items-center gap-3 mt-1">
                  {task.due_date && (
                    <div className="flex items-center gap-1">
                      <Calendar size={12} className="text-slate-400 dark:text-slate-500" />
                      <span className="text-xs text-slate-400 dark:text-slate-500">{task.due_date}</span>
                    </div>
                  )}
                  {"projects" in task && (task as { projects?: { name: string } }).projects && (
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                      {(task as { projects?: { name: string } }).projects?.name}
                    </span>
                  )}
                </div>
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
