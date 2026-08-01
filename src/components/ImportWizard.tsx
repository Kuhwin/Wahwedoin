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
  { value: "status", label: "Status", required: false },
  { value: "assignee", label: "Assignee (email)", required: false },
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
            normalised === "email" ||
            normalised === "assignee email"
          ) {
            initialMapping[h] = "assignee";
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

    const { data: targetProject } = await supabase
      .from("projects")
      .select("team_id")
      .eq("id", targetProjectId)
      .maybeSingle();
    const projectTeamId = targetProject?.team_id || null;

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

      const description = getMappedValue(row, "description");
      const priorityRaw = getMappedValue(row, "priority");
      const dueDate = getMappedValue(row, "due_date");
      const statusRaw = getMappedValue(row, "status");
      const assigneeEmail = getMappedValue(row, "assignee");

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

      let dueDateFormatted: string | null = null;
      if (dueDate) {
        const parsed = new Date(dueDate);
        if (!isNaN(parsed.getTime())) {
          dueDateFormatted = parsed.toISOString().split("T")[0];
        } else {
          failed++;
          importErrors.push(`Row ${i + 2}: Invalid date "${dueDate}".`);
          setImportProgress(i + 1);
          continue;
        }
      }

      let assigneeId: string | null = null;
      if (assigneeEmail) {
        const { data: member } = await supabase
          .from("user_profiles")
          .select("user_id")
          .ilike("user_email", assigneeEmail.trim())
          .limit(1)
          .maybeSingle();

        if (member && projectTeamId) {
          const { data: membership } = await supabase
            .from("team_members")
            .select("id")
            .eq("team_id", projectTeamId)
            .eq("user_id", member.user_id)
            .maybeSingle();
          if (membership) {
            assigneeId = member.user_id;
          }
        } else if (member) {
          assigneeId = member.user_id;
        }

        if (!assigneeId) {
          failed++;
          importErrors.push(`Row ${i + 2}: Assignee email "${assigneeEmail}" not found in this project's team.`);
          setImportProgress(i + 1);
          continue;
        }
      }

      const { error } = await supabase.from("tasks").insert({
        project_id: targetProjectId,
        title: title.trim(),
        description: description?.trim() || null,
        priority,
        status,
        due_date: dueDateFormatted,
        assignee_id: assigneeId,
      });

      if (error) {
        failed++;
        importErrors.push(`Row ${i + 2}: ${error.message}`);
      } else {
        imported++;
      }

      setImportProgress(i + 1);
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
              Select Target Project
            </h2>
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
              Match each CSV header to the corresponding task field
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
