"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Upload,
  ArrowRight,
  ArrowLeft,
  Check,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import Button from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { parseCSV } from "@/lib/csv";
import { type Project } from "@/lib/types";

const TASK_FIELDS = [
  { value: "title", label: "Title", required: true },
  { value: "description", label: "Description", required: false },
  { value: "priority", label: "Priority", required: false },
  { value: "due_date", label: "Due Date", required: false },
  { value: "start_date", label: "Start Date", required: false },
  { value: "status", label: "Status", required: false },
  { value: "assignee", label: "Assignee(s) (emails)", required: false },
  { value: "followers", label: "Followers (emails)", required: false },
  { value: "section", label: "Section", required: false },
  { value: "parent", label: "Parent Task (title)", required: false },
  { value: "milestone", label: "Milestone", required: false },
  { value: "reminder", label: "Reminder At (datetime)", required: false },
  { value: "team", label: "Team (route)", required: false },
  { value: "project", label: "Project (route)", required: false },
] as const;

type TaskField = (typeof TASK_FIELDS)[number]["value"];

const VALID_PRIORITIES = ["low", "medium", "high", "urgent"];
const VALID_STATUSES = ["todo", "in_progress", "done"];

const STEPS = [
  { num: 1, label: "Upload" },
  { num: 2, label: "Map Columns" },
  { num: 3, label: "Preview" },
  { num: 4, label: "Import" },
];

export default function ImportWizard() {
  const supabase = createClient();

  const [step, setStep] = useState(1);
  const [projects, setProjects] = useState<Project[]>([]);
  const [targetProjectId, setTargetProjectId] = useState("");
  const [loadingProjects, setLoadingProjects] = useState(true);

  const [csvData, setCsvData] = useState<string[][]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  const [columnMapping, setColumnMapping] = useState<Record<string, TaskField | "">>({});

  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [importResult, setImportResult] = useState<{
    imported: number;
    failed: number;
    errors: string[];
  } | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadProjects() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: memberships } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id);

      if (memberships && memberships.length > 0) {
        const teamIds = memberships.map((m: { team_id: string }) => m.team_id);
        const { data: projectsData } = await supabase
          .from("projects")
          .select("*")
          .in("team_id", teamIds)
          .eq("status", "active")
          .order("name");

        if (projectsData) {
          setProjects(projectsData);
          if (projectsData.length > 0) setTargetProjectId(projectsData[0].id);
        }
      }
      setLoadingProjects(false);
    }
    void loadProjects();
  }, [supabase]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setParseError(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (!text || !text.trim()) {
        setParseError("The file is empty.");
        return;
      }
      try {
        const rows = parseCSV(text);
        if (rows.length < 2) {
          setParseError("The file must contain a header row and at least one data row.");
          return;
        }
        const headers = rows[0];
        const data = rows.slice(1);
        setCsvHeaders(headers);
        setCsvData(data);

        const initialMapping: Record<string, TaskField | ""> = {};
        headers.forEach((h) => {
          const normalised = h.toLowerCase().trim();
          if (normalised === "title" || normalised === "name" || normalised === "task") {
            initialMapping[h] = "title";
          } else if (normalised === "description" || normalised === "desc") {
            initialMapping[h] = "description";
          } else if (normalised === "priority") {
            initialMapping[h] = "priority";
          } else if (normalised === "due date" || normalised === "duedate" || normalised === "due_date") {
            initialMapping[h] = "due_date";
          } else if (normalised === "status") {
            initialMapping[h] = "status";
          } else if (
            normalised === "assignee" ||
            normalised === "assignees" ||
            normalised === "email" ||
            normalised === "assignee email" ||
            normalised === "assignee emails"
          ) {
            initialMapping[h] = "assignee";
          } else if (normalised === "followers" || normalised === "follower emails") {
            initialMapping[h] = "followers";
          } else if (normalised === "section" || normalised === "column") {
            initialMapping[h] = "section";
          } else if (
            normalised === "parent" ||
            normalised === "parent task" ||
            normalised === "parent task (title)"
          ) {
            initialMapping[h] = "parent";
          } else if (normalised === "milestone" || normalised === "is milestone") {
            initialMapping[h] = "milestone";
          } else if (normalised === "reminder" || normalised === "reminder at") {
            initialMapping[h] = "reminder";
          } else if (
            normalised === "start date" ||
            normalised === "start_date" ||
            normalised === "start"
          ) {
            initialMapping[h] = "start_date";
          } else if (normalised === "team" || normalised === "team name") {
            initialMapping[h] = "team";
          } else if (normalised === "project" || normalised === "project name") {
            initialMapping[h] = "project";
          } else {
            initialMapping[h] = "";
          }
        });
        setColumnMapping(initialMapping);
      } catch {
        setParseError("Failed to parse CSV. Please check the file format.");
      }
    };
    reader.readAsText(file);
  }

  function validateStep1(): boolean {
    const newErrors: Record<string, string> = {};
    if (!targetProjectId) newErrors.project = "Please select a target project.";
    if (csvData.length === 0) newErrors.file = "Please upload a CSV file.";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function validateStep2(): boolean {
    const newErrors: Record<string, string> = {};
    const mappedFields = Object.values(columnMapping).filter((v) => v !== "");
    if (mappedFields.length === 0) {
      newErrors.mapping = "Please map at least one column to a task field.";
    }
    if (!mappedFields.includes("title")) {
      newErrors.mapping = "The Title field must be mapped to a CSV column.";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function goNext() {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    setStep((s) => Math.min(s + 1, 4));
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 1));
  }

  function getMappedValue(
    row: string[],
    field: TaskField
  ): string | null {
    for (const [header, mapped] of Object.entries(columnMapping)) {
      if (mapped === field) {
        const idx = csvHeaders.indexOf(header);
        if (idx >= 0 && idx < row.length) {
          const val = row[idx]?.trim();
          return val || null;
        }
      }
    }
    return null;
  }

  async function handleImport() {
    setImporting(true);
    setImportProgress(0);
    setImportTotal(csvData.length);
    setImportResult(null);

    // ---- Build resolution maps once (org hierarchy: org -> team -> project) ----
    const projectIndex = new Map(projects.map((p) => [p.id, p]));

    const projectsByTeam = new Map<string, Project[]>();
    const projectsByName = new Map<string, Project[]>();
    for (const p of projects) {
      if (p.status !== "active") continue;
      const byTeam = projectsByTeam.get(p.team_id) ?? [];
      byTeam.push(p);
      projectsByTeam.set(p.team_id, byTeam);
      const key = p.name.toLowerCase().trim();
      const byName = projectsByName.get(key) ?? [];
      byName.push(p);
      projectsByName.set(key, byName);
    }

    const teamIds = [...new Set(projects.map((p) => p.team_id))];
    const { data: teamsData } = await supabase
      .from("teams")
      .select("id, name, org_id")
      .in("id", teamIds);
    const teamsById = new Map<string, { id: string; name: string; org_id: string | null }>();
    const teamsByName = new Map<string, { id: string; name: string; org_id: string | null }>();
    for (const t of teamsData ?? []) {
      teamsById.set(t.id, t);
      teamsByName.set(String(t.name).toLowerCase().trim(), t);
    }

    // user_profiles has no email column and its reads are RLS-scoped to shared
    // orgs, so member lookup goes through the SECURITY DEFINER
    // get_org_member_profiles RPC — the same convention the rest of the app
    // uses (manage, people, team pages).
    const orgEmailsCache = new Map<string, Map<string, string>>();
    async function getOrgEmails(orgId: string | null): Promise<Map<string, string>> {
      if (!orgId) return new Map();
      let m = orgEmailsCache.get(orgId);
      if (!m) {
        m = new Map();
        const { data: profiles } = await supabase.rpc("get_org_member_profiles", { p_org_id: orgId });
        for (const p of profiles ?? []) {
          if (p.email) m.set(String(p.email).toLowerCase(), p.user_id);
        }
        orgEmailsCache.set(orgId, m);
      }
      return m;
    }

    const teamMembersCache = new Map<string, Set<string>>();
    async function getTeamMemberIds(teamId: string): Promise<Set<string>> {
      let s = teamMembersCache.get(teamId);
      if (!s) {
        s = new Set();
        const { data } = await supabase.from("team_members").select("user_id").eq("team_id", teamId);
        for (const m of data ?? []) s.add(m.user_id);
        teamMembersCache.set(teamId, s);
      }
      return s;
    }

    const sectionsCache = new Map<string, Map<string, string>>();
    async function getSections(projectId: string): Promise<Map<string, string>> {
      let m = sectionsCache.get(projectId);
      if (!m) {
        m = new Map();
        const { data } = await supabase.from("sections").select("id, name").eq("project_id", projectId);
        for (const s of data ?? []) m.set(s.name.toLowerCase().trim(), s.id);
        sectionsCache.set(projectId, m);
      }
      return m;
    }

    function parseEmailList(raw: string | null): string[] {
      if (!raw) return [];
      return raw
        .split(/[,;]/)
        .map((e) => e.trim())
        .filter(Boolean);
    }

    // Resolve the target project for a row: explicit Team/Project columns route
    // the row; otherwise fall back to the project selected in step 1.
    async function resolveProjectForRow(row: string[]): Promise<{
      projectId: string;
      teamId: string | null;
      error?: string;
    }> {
      const teamValue = getMappedValue(row, "team");
      const projectValue = getMappedValue(row, "project");

      let team: { id: string; name: string; org_id: string | null } | null = null;
      if (teamValue) {
        team = teamsByName.get(teamValue.toLowerCase().trim()) ?? null;
        if (!team) return { projectId: "", teamId: null, error: `Team "${teamValue}" not found in your teams.` };
      }

      let project: Project | null = null;
      if (projectValue) {
        const candidates = (projectsByName.get(projectValue.toLowerCase().trim()) ?? []).filter(
          (p) => !team || p.team_id === team.id
        );
        project = candidates[0] ?? null;
        if (!project) {
          return {
            projectId: "",
            teamId: null,
            error: team
              ? `Project "${projectValue}" not found in team "${team.name}".`
              : `Project "${projectValue}" not found in your projects.`,
          };
        }
      } else if (team) {
        const list = (projectsByTeam.get(team.id) ?? []).filter((p) => p.status === "active");
        if (list.length === 0) {
          return { projectId: "", teamId: null, error: `No active project found in team "${team.name}".` };
        }
        project = list[0];
      } else {
        project = projectIndex.get(targetProjectId) ?? null;
        if (!project) return { projectId: "", teamId: null, error: "No default target project selected." };
      }

      return { projectId: project.id, teamId: project.team_id };
    }

    const parentLinks: { rowIdx: number; taskId: string; projectId: string; parentTitle: string | null }[] = [];
    const insertedByTitle = new Map<string, string>();

    let imported = 0;
    let failed = 0;
    const importErrors: string[] = [];

    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      const title = getMappedValue(row, "title");

      if (!title) {
        failed++;
        importErrors.push(`Row ${i + 2}: Missing title.`);
        setImportProgress(i + 1);
        continue;
      }

      const assignment = await resolveProjectForRow(row);
      if (assignment.error) {
        failed++;
        importErrors.push(`Row ${i + 2}: ${assignment.error}`);
        setImportProgress(i + 1);
        continue;
      }
      const projectId = assignment.projectId;
      const team = assignment.teamId ? teamsById.get(assignment.teamId) ?? null : null;
      const orgEmails = await getOrgEmails(team?.org_id ?? null);
      const memberIds = assignment.teamId ? await getTeamMemberIds(assignment.teamId) : new Set<string>();

      const description = getMappedValue(row, "description");
      const priorityRaw = getMappedValue(row, "priority");
      const dueDate = getMappedValue(row, "due_date");
      const startDateRaw = getMappedValue(row, "start_date");
      const statusRaw = getMappedValue(row, "status");
      const assigneeRaw = getMappedValue(row, "assignee");
      const sectionRaw = getMappedValue(row, "section");
      const milestoneRaw = getMappedValue(row, "milestone");
      const reminderRaw = getMappedValue(row, "reminder");
      const parentTitle = getMappedValue(row, "parent");

      let priority: "low" | "medium" | "high" | "urgent" = "medium";
      if (priorityRaw) {
        const norm = priorityRaw.toLowerCase().trim();
        if (VALID_PRIORITIES.includes(norm)) {
          priority = norm as "low" | "medium" | "high" | "urgent";
        } else {
          failed++;
          importErrors.push(`Row ${i + 2}: Invalid priority "${priorityRaw}".`);
          setImportProgress(i + 1);
          continue;
        }
      }

      let status: "todo" | "in_progress" | "done" = "todo";
      if (statusRaw) {
        const norm = statusRaw.toLowerCase().trim().replace(/\s+/g, "_");
        if (VALID_STATUSES.includes(norm)) {
          status = norm as "todo" | "in_progress" | "done";
        } else {
          failed++;
          importErrors.push(`Row ${i + 2}: Invalid status "${statusRaw}".`);
          setImportProgress(i + 1);
          continue;
        }
      }

      function parseDate(value: string): string | null {
        const parsed = new Date(value);
        if (isNaN(parsed.getTime())) return null;
        return parsed.toISOString().split("T")[0];
      }

      let dueDateFormatted: string | null = null;
      if (dueDate) {
        dueDateFormatted = parseDate(dueDate);
        if (!dueDateFormatted) {
          failed++;
          importErrors.push(`Row ${i + 2}: Invalid date "${dueDate}".`);
          setImportProgress(i + 1);
          continue;
        }
      }

      let startDateFormatted: string | null = null;
      if (startDateRaw) {
        startDateFormatted = parseDate(startDateRaw);
        if (!startDateFormatted) {
          failed++;
          importErrors.push(`Row ${i + 2}: Invalid start date "${startDateRaw}".`);
          setImportProgress(i + 1);
          continue;
        }
      }

      let reminderAt: string | null = null;
      if (reminderRaw) {
        const parsed = new Date(reminderRaw);
        if (isNaN(parsed.getTime())) {
          failed++;
          importErrors.push(`Row ${i + 2}: Invalid reminder datetime "${reminderRaw}".`);
          setImportProgress(i + 1);
          continue;
        }
        reminderAt = parsed.toISOString();
      }

      const assigneeEmails = parseEmailList(assigneeRaw);
      const assigneeIds: string[] = [];
      for (const email of assigneeEmails) {
        const uid = orgEmails.get(email.toLowerCase());
        if (uid && memberIds.has(uid)) assigneeIds.push(uid);
      }
      if (assigneeRaw && assigneeEmails.length > 0 && assigneeIds.length !== assigneeEmails.length) {
        failed++;
        importErrors.push(`Row ${i + 2}: One or more assignee emails not found in this project's team.`);
        setImportProgress(i + 1);
        continue;
      }

      let sectionId: string | null = null;
      if (sectionRaw) {
        const sections = await getSections(projectId);
        const key = sectionRaw.toLowerCase().trim();
        if (sections.has(key)) {
          sectionId = sections.get(key)!;
        } else {
          const { data: created, error: secErr } = await supabase
            .from("sections")
            .insert({ project_id: projectId, name: sectionRaw.trim() })
            .select("id")
            .single();
          if (secErr || !created) {
            failed++;
            importErrors.push(`Row ${i + 2}: Could not create section "${sectionRaw}".`);
            setImportProgress(i + 1);
            continue;
          }
          sections.set(key, created.id);
          sectionId = created.id;
        }
      }

      const isMilestone = milestoneRaw
        ? ["true", "yes", "1", "milestone", "y", "x", "check"].includes(milestoneRaw.toLowerCase().trim())
        : false;

      const { data: inserted, error } = await supabase
        .from("tasks")
        .insert({
          project_id: projectId,
          title: title.trim(),
          description: description?.trim() || null,
          priority,
          status,
          due_date: dueDateFormatted,
          start_date: startDateFormatted,
          section_id: sectionId,
          is_milestone: isMilestone,
          assignee_id: assigneeIds[0] ?? null,
          reminder_at: reminderAt,
        })
        .select("id")
        .single();

      if (error || !inserted) {
        failed++;
        importErrors.push(`Row ${i + 2}: ${error?.message ?? "Failed to create task."}`);
        setImportProgress(i + 1);
        continue;
      }

      insertedByTitle.set(`${projectId}::${title.trim().toLowerCase()}`, inserted.id);
      parentLinks.push({ rowIdx: i, taskId: inserted.id, projectId, parentTitle });

      if (assigneeIds.length > 0) {
        const { error: asgErr } = await supabase
          .from("task_assignees")
          .insert(assigneeIds.map((uid) => ({ task_id: inserted.id, user_id: uid })));
        if (asgErr) {
          failed++;
          importErrors.push(`Row ${i + 2}: Could not set assignees (${asgErr.message}).`);
          setImportProgress(i + 1);
          continue;
        }
      }

      const followerEmails = parseEmailList(getMappedValue(row, "followers"));
      const followerIds: string[] = [];
      for (const email of followerEmails) {
        const uid = orgEmails.get(email.toLowerCase());
        if (uid && memberIds.has(uid)) followerIds.push(uid);
      }
      if (followerEmails.length > 0 && followerIds.length !== followerEmails.length) {
        failed++;
        importErrors.push(`Row ${i + 2}: One or more follower emails not found in this project's team.`);
        setImportProgress(i + 1);
        continue;
      }
      if (followerIds.length > 0) {
        const { error: folErr } = await supabase
          .from("task_followers")
          .insert(followerIds.map((uid) => ({ task_id: inserted.id, user_id: uid })));
        if (folErr) {
          failed++;
          importErrors.push(`Row ${i + 2}: Could not add followers (${folErr.message}).`);
          setImportProgress(i + 1);
          continue;
        }
      }

      imported++;
      setImportProgress(i + 1);
    }

    // Second pass: link subtasks to their parents (by title, within the same
    // project). Already-imported rows win; otherwise fall back to existing
    // tasks with the same title in that project.
    for (const link of parentLinks) {
      if (!link.parentTitle) continue;
      const key = `${link.projectId}::${link.parentTitle.toLowerCase().trim()}`;
      if (insertedByTitle.get(key) === link.taskId) {
        failed++;
        importErrors.push(`Row ${link.rowIdx + 2}: Parent task cannot reference itself.`);
        continue;
      }
      let parentId = insertedByTitle.get(key) ?? null;
      if (!parentId) {
        const { data: existing } = await supabase
          .from("tasks")
          .select("id")
          .eq("project_id", link.projectId)
          .eq("title", link.parentTitle)
          .maybeSingle();
        parentId = existing?.id ?? null;
      }
      if (!parentId) {
        failed++;
        importErrors.push(`Row ${link.rowIdx + 2}: Parent task "${link.parentTitle}" not found in project.`);
        continue;
      }
      const { error } = await supabase.from("tasks").update({ parent_id: parentId }).eq("id", link.taskId);
      if (error) {
        failed++;
        importErrors.push(`Row ${link.rowIdx + 2}: Could not link parent task (${error.message}).`);
      }
    }

    setImportResult({ imported, failed, errors: importErrors });
    setImporting(false);
  }

  function resetAll() {
    setStep(1);
    setCsvData([]);
    setCsvHeaders([]);
    setFileName("");
    setParseError(null);
    setColumnMapping({});
    setImporting(false);
    setImportProgress(0);
    setImportTotal(0);
    setImportResult(null);
    setErrors({});
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const previewRows = csvData.slice(0, 10);

  return (
    <div>
      {/* Step Indicator */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, idx) => (
          <div key={s.num} className="flex items-center gap-2">
            <button
              onClick={() => {
                if (s.num < step) setStep(s.num);
              }}
              disabled={s.num > step}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                s.num === step
                  ? "bg-indigo-600 text-white"
                  : s.num < step
                    ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 cursor-pointer hover:bg-indigo-200 dark:hover:bg-indigo-900/50"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed"
              )}
            >
              {s.num < step ? (
                <Check size={14} />
              ) : (
                <span
                  className={cn(
                    "h-5 w-5 rounded-full flex items-center justify-center text-xs",
                    s.num === step
                      ? "bg-white/20"
                      : "bg-slate-200 dark:bg-slate-700"
                  )}
                >
                  {s.num}
                </span>
              )}
              <span className="hidden sm:inline">{s.label}</span>
            </button>
            {idx < STEPS.length - 1 && (
              <div
                className={cn(
                  "h-px w-6 sm:w-10",
                  s.num < step
                    ? "bg-indigo-300 dark:bg-indigo-700"
                    : "bg-slate-200 dark:bg-slate-700"
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Select Default Project
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Tasks without a Team or Project column are imported here. If you map Team or
              Project columns in step 2, each row is routed into the matching project instead.
            </p>
            {loadingProjects ? (
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <div className="w-4 h-4 border-2 border-slate-200 dark:border-slate-700 border-t-indigo-600 rounded-full animate-spin" />
                Loading projects...
              </div>
            ) : projects.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No active projects found. Please create a project first.
              </p>
            ) : (
              <select
                value={targetProjectId}
                onChange={(e) => setTargetProjectId(e.target.value)}
                className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            {errors.project && (
              <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                <AlertCircle size={12} />
                {errors.project}
              </p>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Upload CSV File
            </h2>

            <div
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors",
                csvData.length > 0
                  ? "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/10"
                  : "border-slate-300 dark:border-slate-600 hover:border-accent/50 dark:hover:border-accent/50 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileSelect}
                className="hidden"
              />
              {csvData.length > 0 ? (
                <div className="space-y-2">
                  <CheckCircle2
                    size={32}
                    className="mx-auto text-green-600 dark:text-green-400"
                  />
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {fileName}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {csvData.length} rows found &middot; {csvHeaders.length} columns
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <FileSpreadsheet
                    size={32}
                    className="mx-auto text-slate-300 dark:text-slate-600"
                  />
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Click to upload a CSV file
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    Supports standard CSV with quoted fields
                  </p>
                </div>
              )}
            </div>

            {parseError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm rounded-lg px-4 py-3 flex items-center gap-2">
                <AlertCircle size={14} />
                {parseError}
              </div>
            )}
            {errors.file && (
              <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                <AlertCircle size={12} />
                {errors.file}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Map Columns */}
      {step === 2 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Map CSV Columns to Task Fields
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Match each CSV header to the corresponding task field. Map the Team or Project
              columns to route each row into the matching project.
            </p>
          </div>

          {errors.mapping && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm rounded-lg px-4 py-3 flex items-center gap-2">
              <AlertCircle size={14} />
              {errors.mapping}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">
                    CSV Column
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">
                    Sample Value
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">
                    Maps To
                  </th>
                </tr>
              </thead>
              <tbody>
                {csvHeaders.map((header) => {
                  const sampleRow = csvData[0];
                  const sampleIdx = csvHeaders.indexOf(header);
                  const sampleValue =
                    sampleRow && sampleIdx < sampleRow.length
                      ? sampleRow[sampleIdx]
                      : "";

                  return (
                    <tr
                      key={header}
                      className="border-b border-slate-100 dark:border-slate-800"
                    >
                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {header}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-slate-500 dark:text-slate-400 truncate max-w-[200px] block">
                          {sampleValue || "\u2014"}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <select
                          value={columnMapping[header] || ""}
                          onChange={(e) =>
                            setColumnMapping((prev) => ({
                              ...prev,
                              [header]: e.target.value as TaskField | "",
                            }))
                          }
                          className="block w-full max-w-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
                        >
                          <option value="">Don&apos;t import</option>
                          {TASK_FIELDS.map((field) => (
                            <option key={field.value} value={field.value}>
                              {field.label}
                              {field.required ? " (required)" : ""}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === 3 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Preview Import
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Showing first {Math.min(10, csvData.length)} of {csvData.length} rows
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">
                    #
                  </th>
                  {TASK_FIELDS.map((field) => {
                    const isMapped = Object.values(columnMapping).includes(field.value);
                    if (!isMapped) return null;
                    return (
                      <th
                        key={field.value}
                        className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400"
                      >
                        {field.label}
                        {field.required && (
                          <span className="text-red-500 ml-1">*</span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, rowIdx) => {
                  const title = getMappedValue(row, "title");
                  const description = getMappedValue(row, "description");
                  const priority = getMappedValue(row, "priority");
                  const dueDate = getMappedValue(row, "due_date");
                  const status = getMappedValue(row, "status");
                  const assignee = getMappedValue(row, "assignee");
                  const hasTitle = !!title;

                  return (
                    <tr
                      key={rowIdx}
                      className={cn(
                        "border-b border-slate-100 dark:border-slate-800",
                        !hasTitle && "bg-red-50 dark:bg-red-900/10"
                      )}
                    >
                      <td className="py-3 px-4 text-slate-400 dark:text-slate-500">
                        {rowIdx + 1}
                      </td>
                      {Object.values(columnMapping).includes("title") && (
                        <td className="py-3 px-4">
                          <span
                            className={cn(
                              "text-slate-900 dark:text-slate-100",
                              !hasTitle && "text-red-600 dark:text-red-400 italic"
                            )}
                          >
                            {hasTitle ? (
                              title!.length > 50
                                ? title!.slice(0, 50) + "\u2026"
                                : title
                            ) : (
                              "Missing title"
                            )}
                          </span>
                        </td>
                      )}
                      {Object.values(columnMapping).includes("description") && (
                        <td className="py-3 px-4">
                          <span className="text-slate-600 dark:text-slate-400 truncate max-w-[200px] block">
                            {description
                              ? description.length > 50
                                ? description.slice(0, 50) + "\u2026"
                                : description
                              : "\u2014"}
                          </span>
                        </td>
                      )}
                      {Object.values(columnMapping).includes("priority") && (
                        <td className="py-3 px-4">
                          {priority ? (
                            <span
                              className={cn(
                                "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                                priority === "urgent" &&
                                  "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
                                priority === "high" &&
                                  "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400",
                                priority === "medium" &&
                                  "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
                                priority === "low" &&
                                  "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400",
                                !VALID_PRIORITIES.includes(priority.toLowerCase()) &&
                                  "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                              )}
                            >
                              {VALID_PRIORITIES.includes(priority.toLowerCase())
                                ? priority.charAt(0).toUpperCase() + priority.slice(1).toLowerCase()
                                : `Invalid: ${priority}`}
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500">
                              medium
                            </span>
                          )}
                        </td>
                      )}
                      {Object.values(columnMapping).includes("due_date") && (
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                          {dueDate || "\u2014"}
                        </td>
                      )}
                      {Object.values(columnMapping).includes("status") && (
                        <td className="py-3 px-4">
                          {status ? (
                            <span
                              className={cn(
                                "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                                status === "done"
                                  ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                                  : status === "in_progress"
                                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                                    : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400"
                              )}
                            >
                              {status.replace("_", " ")}
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500">
                              To Do
                            </span>
                          )}
                        </td>
                      )}
                      {Object.values(columnMapping).includes("assignee") && (
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400 text-xs">
                          {assignee || "\u2014"}
                        </td>
                      )}
                      {TASK_FIELDS.filter(
                        (f) =>
                          !["title", "description", "priority", "due_date", "status", "assignee"].includes(
                            f.value
                          ) && Object.values(columnMapping).includes(f.value)
                      ).map((f) => (
                        <td
                          key={f.value}
                          className="py-3 px-4 text-slate-600 dark:text-slate-400 text-xs"
                        >
                          {getMappedValue(row, f.value as TaskField) || "\u2014"}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Step 4: Import */}
      {step === 4 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Import Tasks
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {csvData.length} tasks will be imported into{" "}
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {projects.find((p) => p.id === targetProjectId)?.name ?? "selected project"}
              </span>
              {Object.values(columnMapping).some((v) => v === "project" || v === "team")
                ? " or the project named in each row"
                : ""}
            </p>
          </div>

          {importing && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">
                  Importing tasks...
                </span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {importProgress} / {importTotal}
                </span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: `${importTotal > 0 ? (importProgress / importTotal) * 100 : 0}%`,
                    backgroundColor: "var(--accent)",
                  }}
                />
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Please do not close this page whilst importing...
              </p>
            </div>
          )}

          {!importing && !importResult && (
            <div className="text-center py-8 space-y-4">
              <Upload
                size={40}
                className="mx-auto text-slate-300 dark:text-slate-600"
              />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Ready to import {csvData.length} tasks
              </p>
            </div>
          )}

          {!importing && importResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 text-center">
                  <CheckCircle2
                    size={24}
                    className="mx-auto text-green-600 dark:text-green-400 mb-1"
                  />
                  <p className="text-2xl font-bold text-green-700 dark:text-green-400">
                    {importResult.imported}
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-500">
                    Imported
                  </p>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-center">
                  <XCircle
                    size={24}
                    className="mx-auto text-red-600 dark:text-red-400 mb-1"
                  />
                  <p className="text-2xl font-bold text-red-700 dark:text-red-400">
                    {importResult.failed}
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-500">Failed</p>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Error Details
                  </h3>
                  <div className="max-h-48 overflow-y-auto bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-xl p-4 space-y-1">
                    {importResult.errors.map((err, i) => (
                      <p
                        key={i}
                        className="text-xs text-red-600 dark:text-red-400"
                      >
                        {err}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6">
        <div>
          {step > 1 && !importing && (
            <Button variant="secondary" onClick={goBack}>
              <ArrowLeft size={16} />
              Back
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {step < 4 && (
            <Button onClick={goNext}>
              Next
              <ArrowRight size={16} />
            </Button>
          )}
          {step === 4 && !importing && !importResult && (
            <Button onClick={handleImport}>
              <Upload size={16} />
              Start Import
            </Button>
          )}
          {step === 4 && importResult && (
            <>
              <Button variant="secondary" onClick={resetAll}>
                Import Another File
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
