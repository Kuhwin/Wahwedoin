"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Briefcase, Plus, ArrowLeft, Trash2, FolderPlus } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Badge from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { type Portfolio, type Project, type Team } from "@/lib/types";

interface PortfolioWithStats extends Portfolio {
  project_count: number;
  completed_projects: number;
  team_name?: string;
}

interface PortfolioProject {
  portfolio_id: string;
  project_id: string;
  added_at: string;
  projects: Project;
}

export default function PortfoliosPage() {
  const [portfolios, setPortfolios] = useState<PortfolioWithStats[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newTeamId, setNewTeamId] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [selectedPortfolio, setSelectedPortfolio] = useState<PortfolioWithStats | null>(null);
  const [portfolioProjects, setPortfolioProjects] = useState<PortfolioProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [showAddProject, setShowAddProject] = useState(false);
  const [availableProjects, setAvailableProjects] = useState<Project[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<PortfolioWithStats | null>(null);
  const [confirmRemoveProject, setConfirmRemoveProject] = useState<PortfolioProject | null>(null);
  const supabase = createClient();

  const loadPortfolios = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: memberships } = await supabase
      .from("team_members")
      .select("team_id, teams(*)")
      .eq("user_id", user.id);

    const teamIds = (memberships as { team_id: string; teams: Team }[] | null)
      ?.map((m) => m.team_id) ?? [];

    if (teamIds.length === 0) {
      setLoading(false);
      return;
    }

    const teamMap = new Map(
      (memberships as { team_id: string; teams: Team }[]).map((m) => [m.team_id, m.teams])
    );

    setTeams(teamMap.values().toArray());

    const { data: portfolioData } = await supabase
      .from("portfolios")
      .select("*")
      .in("team_id", teamIds)
      .order("created_at", { ascending: false });

    if (portfolioData) {
      const enriched = await Promise.all(
        portfolioData.map(async (p: Portfolio) => {
          const { count: projectCount } = await supabase
            .from("portfolio_projects")
            .select("*", { count: "exact", head: true })
            .eq("portfolio_id", p.id);

          const { count: completedCount } = await supabase
            .from("portfolio_projects")
            .select("projects!inner(status)", { count: "exact", head: true })
            .eq("portfolio_id", p.id)
            .eq("projects.status", "completed");

          return {
            ...p,
            project_count: projectCount ?? 0,
            completed_projects: completedCount ?? 0,
            team_name: teamMap.get(p.team_id)?.name,
          };
        })
      );

      setPortfolios(enriched);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadPortfolios();
  }, [loadPortfolios]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newTeamId) return;
    setCreating(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();

    const { data, error: createError } = await supabase
      .from("portfolios")
      .insert({
        name: newName.trim(),
        description: newDesc.trim() || null,
        team_id: newTeamId,
        created_by: user?.id,
      })
      .select()
      .single();

    if (createError) {
      setError(createError.message || "Failed to create portfolio. Please try again.");
      setCreating(false);
      return;
    }

    if (data) {
      const team = teams.find((t) => t.id === newTeamId);
      setPortfolios([
        { ...data, project_count: 0, completed_projects: 0, team_name: team?.name },
        ...portfolios,
      ]);
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      setError(null);
    }
    setCreating(false);
  }

  async function loadPortfolioProjects(portfolio: PortfolioWithStats) {
    setSelectedPortfolio(portfolio);
    setLoadingProjects(true);

    const { data } = await supabase
      .from("portfolio_projects")
      .select("portfolio_id, project_id, added_at, projects(*)")
      .eq("portfolio_id", portfolio.id);

    if (data) setPortfolioProjects(data as PortfolioProject[]);
    setLoadingProjects(false);
  }

  async function loadAvailableProjects() {
    if (!selectedPortfolio) return;

    const { data: existingIds } = await supabase
      .from("portfolio_projects")
      .select("project_id")
      .eq("portfolio_id", selectedPortfolio.id);

    const excludeIds = existingIds?.map((e: { project_id: string }) => e.project_id) ?? [];

    let query = supabase
      .from("projects")
      .select("*")
      .eq("team_id", selectedPortfolio.team_id)
      .eq("status", "active")
      .order("name");

    if (excludeIds.length > 0) {
      query = query.not("id", "in", `(${excludeIds.join(",")})`);
    }

    const { data } = await query;
    setAvailableProjects(data ?? []);
    setShowAddProject(true);
  }

  async function handleAddProject(projectId: string) {
    if (!selectedPortfolio) return;

    const { error: addError } = await supabase
      .from("portfolio_projects")
      .insert({ portfolio_id: selectedPortfolio.id, project_id: projectId });

    if (addError) {
      setMessage({ type: "error", text: addError.message || "Failed to add project." });
      return;
    }

    const { data: projectData } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (projectData) {
      const newEntry: PortfolioProject = {
        portfolio_id: selectedPortfolio.id,
        project_id: projectId,
        added_at: new Date().toISOString(),
        projects: projectData,
      };
      setPortfolioProjects([...portfolioProjects, newEntry]);

      const wasCompleted = projectData.status === "completed";
      setSelectedPortfolio((prev) =>
        prev
          ? {
              ...prev,
              project_count: prev.project_count + 1,
              completed_projects: prev.completed_projects + (wasCompleted ? 1 : 0),
            }
          : prev
      );
      setPortfolios((prev) =>
        prev.map((p) =>
          p.id === selectedPortfolio.id
            ? {
                ...p,
                project_count: p.project_count + 1,
                completed_projects: p.completed_projects + (wasCompleted ? 1 : 0),
              }
            : p
        )
      );
    }

    setAvailableProjects((prev) => prev.filter((p) => p.id !== projectId));
  }

  async function handleRemoveProject(entry: PortfolioProject) {
    if (!selectedPortfolio) return;

    const { error: removeError } = await supabase
      .from("portfolio_projects")
      .delete()
      .eq("portfolio_id", selectedPortfolio.id)
      .eq("project_id", entry.project_id);

    if (removeError) {
      setMessage({ type: "error", text: removeError.message || "Failed to remove project." });
      return;
    }

    setPortfolioProjects((prev) =>
      prev.filter((e) => e.project_id !== entry.project_id)
    );

    const wasCompleted = entry.projects.status === "completed";
    setSelectedPortfolio((prev) =>
      prev
        ? {
            ...prev,
            project_count: Math.max(0, prev.project_count - 1),
            completed_projects: Math.max(0, prev.completed_projects - (wasCompleted ? 1 : 0)),
          }
        : prev
    );
    setPortfolios((prev) =>
      prev.map((p) =>
        p.id === selectedPortfolio.id
          ? {
              ...p,
              project_count: Math.max(0, p.project_count - 1),
              completed_projects: Math.max(0, p.completed_projects - (wasCompleted ? 1 : 0)),
            }
          : p
      )
    );

    setConfirmRemoveProject(null);
  }

  async function handleDeletePortfolio(portfolio: PortfolioWithStats) {
    const { error } = await supabase.from("portfolios").delete().eq("id", portfolio.id);
    if (error) {
      setMessage({ type: "error", text: error.message || "Failed to delete portfolio." });
      return;
    }
    setPortfolios((prev) => prev.filter((p) => p.id !== portfolio.id));
    setConfirmDelete(null);
    if (selectedPortfolio?.id === portfolio.id) {
      setSelectedPortfolio(null);
      setPortfolioProjects([]);
    }
  }

  function getCompletionPercent(portfolio: PortfolioWithStats) {
    if (portfolio.project_count === 0) return 0;
    return Math.round((portfolio.completed_projects / portfolio.project_count) * 100);
  }

  function getHealthBadge(portfolio: PortfolioWithStats) {
    const pct = getCompletionPercent(portfolio);
    if (pct === 100) return <Badge variant="success">Complete</Badge>;
    if (pct >= 50) return <Badge variant="info">On Track</Badge>;
    if (portfolio.project_count === 0) return <Badge variant="default">Empty</Badge>;
    return <Badge variant="warning">Needs Attention</Badge>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-slate-200 dark:border-slate-700 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (selectedPortfolio) {
    return (
      <div className="max-w-5xl mx-auto">
        {message && (
          <div
            className={cn(
              "mb-4 px-4 py-3 rounded-lg text-sm font-medium",
              message.type === "error"
                ? "bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"
                : "bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
            )}
          >
            <div className="flex items-center justify-between">
              <span>{message.text}</span>
              <button
                onClick={() => setMessage(null)}
                className="ml-3 text-current opacity-60 hover:opacity-100"
              >
                x
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => { setSelectedPortfolio(null); setPortfolioProjects([]); }}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {selectedPortfolio.name}
            </h1>
            {selectedPortfolio.description && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {selectedPortfolio.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {getHealthBadge(selectedPortfolio)}
            <Button onClick={() => void loadAvailableProjects()}>
              <FolderPlus size={16} />
              Add Project
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Projects</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {selectedPortfolio.project_count}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Completed</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {selectedPortfolio.completed_projects}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Completion</p>
            <div className="flex items-center gap-3">
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {getCompletionPercent(selectedPortfolio)}%
              </p>
              <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    getCompletionPercent(selectedPortfolio) === 100
                      ? "bg-green-500"
                      : getCompletionPercent(selectedPortfolio) >= 50
                        ? "bg-blue-500"
                        : "bg-amber-500"
                  )}
                  style={{ width: `${getCompletionPercent(selectedPortfolio)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {loadingProjects ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-slate-200 dark:border-slate-700 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : portfolioProjects.length === 0 ? (
          <div className="text-center py-16">
            <Briefcase size={48} className="text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">No projects in this portfolio</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Add projects to start tracking progress</p>
            <Button onClick={() => void loadAvailableProjects()}>
              <FolderPlus size={16} />
              Add Project
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {portfolioProjects.map((entry) => {
              const project = entry.projects;
              return (
                <div
                  key={entry.project_id}
                  className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:border-slate-300 dark:hover:border-slate-600 transition-colors group"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: project.color + "20" }}
                    >
                      <Briefcase size={18} style={{ color: project.color }} />
                    </div>
                    <div>
                      <h3 className="font-medium text-slate-900 dark:text-slate-100">{project.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge
                          variant={
                            project.status === "completed"
                              ? "success"
                              : project.status === "active"
                                ? "info"
                                : "default"
                          }
                        >
                          {project.status}
                        </Badge>
                        {project.description && (
                          <span className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-[200px]">
                            {project.description}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setConfirmRemoveProject(entry)}
                    className="p-2 rounded-lg text-slate-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-all"
                    title="Remove from portfolio"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <Modal open={showAddProject} onClose={() => setShowAddProject(false)} title="Add Project">
          <div className="space-y-3">
            {availableProjects.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">
                No available projects to add.
              </p>
            ) : (
              availableProjects.map((project) => (
                <div
                  key={project.id}
                  className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-8 w-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: project.color + "20" }}
                    >
                      <Briefcase size={16} style={{ color: project.color }} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{project.name}</p>
                      <Badge variant={project.status === "active" ? "info" : "default"}>
                        {project.status}
                      </Badge>
                    </div>
                  </div>
                  <Button size="sm" onClick={() => void handleAddProject(project.id)}>
                    Add
                  </Button>
                </div>
              ))
            )}
            <div className="flex justify-end pt-2">
              <Button variant="secondary" onClick={() => setShowAddProject(false)}>
                Done
              </Button>
            </div>
          </div>
        </Modal>

        <Modal
          open={!!confirmRemoveProject}
          onClose={() => setConfirmRemoveProject(null)}
          title="Remove Project"
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Remove <strong>{confirmRemoveProject?.projects.name}</strong> from this portfolio?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmRemoveProject(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => confirmRemoveProject && void handleRemoveProject(confirmRemoveProject)}
              >
                Remove
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {message && (
        <div
          className={cn(
            "mb-4 px-4 py-3 rounded-lg text-sm font-medium",
            message.type === "error"
              ? "bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"
              : "bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
          )}
        >
          <div className="flex items-center justify-between">
            <span>{message.text}</span>
            <button
              onClick={() => setMessage(null)}
              className="ml-3 text-current opacity-60 hover:opacity-100"
            >
              x
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Portfolios</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Group projects together and track overall progress
          </p>
        </div>
        <Button onClick={() => { setError(null); setShowCreate(true); }}>
          <Plus size={16} />
          New Portfolio
        </Button>
      </div>

      {portfolios.length === 0 ? (
        <div className="text-center py-16">
          <Briefcase size={48} className="text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">No portfolios yet</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Create a portfolio to group related projects
          </p>
          <Button onClick={() => { setError(null); setShowCreate(true); }}>
            <Plus size={16} />
            Create Portfolio
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {portfolios.map((portfolio) => {
            const pct = getCompletionPercent(portfolio);
            return (
              <button
                key={portfolio.id}
                onClick={() => void loadPortfolioProjects(portfolio)}
                className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 hover:border-indigo-300 dark:hover:border-indigo-500 hover:shadow-md transition-all group relative"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="h-12 w-12 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/50 transition-colors">
                    <Briefcase size={20} className="text-indigo-600" />
                  </div>
                  {getHealthBadge(portfolio)}
                </div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  {portfolio.name}
                </h3>
                {portfolio.description && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-3">
                    {portfolio.description}
                  </p>
                )}
                <div className="mt-auto">
                  <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500 mb-2">
                    <span>{portfolio.project_count} project{portfolio.project_count !== 1 ? "s" : ""}</span>
                    <span>{pct}% complete</span>
                  </div>
                  <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        pct === 100
                          ? "bg-green-500"
                          : pct >= 50
                            ? "bg-blue-500"
                            : "bg-amber-500"
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                {portfolio.team_name && (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
                    {portfolio.team_name}
                  </p>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(portfolio); }}
                  className="absolute top-3 right-12 p-1.5 rounded-lg text-slate-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-all"
                  title="Delete portfolio"
                >
                  <Trash2 size={14} />
                </button>
              </button>
            );
          })}
        </div>
      )}

      <Modal open={showCreate} onClose={() => { setShowCreate(false); setError(null); }} title="Create Portfolio">
        <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}
          <Input
            label="Portfolio Name"
            placeholder="e.g. Q4 Initiatives"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
          />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Description</label>
            <textarea
              placeholder="What projects does this portfolio group?"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
              rows={3}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Team</label>
            <select
              value={newTeamId}
              onChange={(e) => setNewTeamId(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => { setShowCreate(false); setError(null); }}>
              Cancel
            </Button>
            <Button type="submit" disabled={creating}>
              {creating ? "Creating..." : "Create Portfolio"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete Portfolio" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Are you sure you want to delete <strong>{confirmDelete?.name}</strong>? This will remove all project associations but will not delete the projects themselves.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => confirmDelete && void handleDeletePortfolio(confirmDelete)}>
              Delete Portfolio
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
