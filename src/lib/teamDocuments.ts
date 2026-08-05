import { createClient } from "@/lib/supabase/client";
import { fetchDriveFolder } from "@/lib/linkedAccounts";
import type { TeamDocumentSource } from "@/lib/types";

export interface TeamDocumentRow {
  source: TeamDocumentSource;
  project_id?: string | null;
  task_id?: string | null;
  drive_file_id?: string | null;
  internal_doc_id?: string | null;
  title: string;
  mime_type?: string | null;
  web_view_link?: string | null;
  icon_link?: string | null;
  category?: string;
}

export interface SyncTeamDocumentsResult {
  ok: boolean;
  error?: string | null;
  driveCount: number;
}

/**
 * Upsert arbitrary team_documents rows (drive_picker, task_comment, etc.)
 * via the sync_team_documents RPC. Safe to call with a single row or a
 * batch; RLS is handled by the SECURITY DEFINER function.
 */
export async function upsertTeamDocuments(
  teamId: string,
  rows: TeamDocumentRow[]
): Promise<{ ok: boolean; error?: string | null }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { error } = await supabase.rpc("sync_team_documents", {
    p_team_id: teamId,
    p_rows: rows,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

function toDocumentRow(
  source: "drive_folder_team" | "drive_folder_project",
  projectId: string | null,
  file: { id: string; name: string; mimeType: string; webViewLink?: string; iconLink?: string }
): TeamDocumentRow {
  return {
    source,
    project_id: projectId,
    drive_file_id: file.id,
    title: file.name,
    mime_type: file.mimeType,
    web_view_link: file.webViewLink ?? null,
    icon_link: file.iconLink ?? null,
  };
}

/**
 * Mirror the team's internal docs and linked Google Drive folders
 * (team-level plus each project's folder) into team_documents via the
 * sync_team_documents RPC. Drive folder listings are fetched with the
 * current user's per-account OAuth token; the RPC handles upserting and
 * cleaning up rows that no longer exist.
 */
export async function syncTeamDocuments(teamId: string): Promise<SyncTeamDocumentsResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in", driveCount: 0 };

  const { data: team } = await supabase
    .from("teams")
    .select("drive_account_id, drive_folder_id")
    .eq("id", teamId)
    .single();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, drive_account_id, drive_folder_id")
    .eq("team_id", teamId);

  const rows: TeamDocumentRow[] = [];

  if (team?.drive_account_id && team?.drive_folder_id) {
    const files = await fetchDriveFolder(team.drive_account_id, team.drive_folder_id);
    rows.push(...files.map((f) => toDocumentRow("drive_folder_team", null, f)));
  }

  for (const project of projects || []) {
    if (!project.drive_account_id || !project.drive_folder_id) continue;
    const files = await fetchDriveFolder(project.drive_account_id, project.drive_folder_id);
    rows.push(...files.map((f) => toDocumentRow("drive_folder_project", project.id, f)));
  }

  const { error } = await supabase.rpc("sync_team_documents", {
    p_team_id: teamId,
    p_rows: rows,
  });

  if (error) return { ok: false, error: error.message, driveCount: rows.length };
  return { ok: true, error: null, driveCount: rows.length };
}
