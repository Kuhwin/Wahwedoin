import { createClient } from "@/lib/supabase/client";
import {
  fetchDriveFolder,
  getValidToken,
  type LinkedGoogleAccount,
} from "@/lib/linkedAccounts";
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
 * batch; RLS is handled by the SECURITY DEFINER function. cleanup=false by
 * default so a picker/comment sync never removes Drive-folder rows.
 */
export async function upsertTeamDocuments(
  teamId: string,
  rows: TeamDocumentRow[],
  cleanup = false
): Promise<{ ok: boolean; error?: string | null }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const { error } = await supabase.rpc("sync_team_documents", {
    p_team_id: teamId,
    p_rows: rows,
    p_cleanup: cleanup,
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

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  iconLink?: string;
}

/**
 * List a Drive folder only when the linked account has a usable token.
 * Returns null when the token is missing/expired and cannot be refreshed,
 * so a failed sync never looks like an empty folder (which would wipe the
 * folder's docs from team_documents).
 */
async function fetchFolderOrNull(accountId: string, folderId: string): Promise<DriveFile[] | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("user_google_accounts")
    .select("*")
    .eq("id", accountId)
    .single();
  if (!data) return null;
  const token = await getValidToken(data as LinkedGoogleAccount);
  if (!token) return null;
  return fetchDriveFolder(accountId, folderId);
}

/**
 * Mirror the team's internal docs and linked Google Drive folders
 * (team-level plus each project's folder) into team_documents via the
 * sync_team_documents RPC. Drive folder listings are fetched with the
 * current user's per-account OAuth token; the RPC handles upserting and
 * cleaning up rows that no longer exist. Cleanup is skipped when any
 * folder fetch failed so stale-but-real rows are never wiped.
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
  let fetchFailed = false;

  if (team?.drive_account_id && team?.drive_folder_id) {
    const files = await fetchFolderOrNull(team.drive_account_id, team.drive_folder_id);
    if (files === null) {
      fetchFailed = true;
    } else {
      rows.push(...files.map((f) => toDocumentRow("drive_folder_team", null, f)));
    }
  }

  for (const project of projects || []) {
    if (!project.drive_account_id || !project.drive_folder_id) continue;
    const files = await fetchFolderOrNull(project.drive_account_id, project.drive_folder_id);
    if (files === null) {
      fetchFailed = true;
    } else {
      rows.push(...files.map((f) => toDocumentRow("drive_folder_project", project.id, f)));
    }
  }

  const { error } = await supabase.rpc("sync_team_documents", {
    p_team_id: teamId,
    p_rows: rows,
    p_cleanup: !fetchFailed,
  });

  if (error) return { ok: false, error: error.message, driveCount: rows.length };
  return { ok: true, error: null, driveCount: rows.length };
}
