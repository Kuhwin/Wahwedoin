import { createClient } from "@/lib/supabase/client";
import {
  getLinkedAccounts,
  fetchGoogleAPI,
  type LinkedGoogleAccount,
} from "@/lib/linkedAccounts";
import type { TeamDocumentRow } from "@/lib/teamDocuments";

const DRIVE_URL_RE = /https?:\/\/(?:drive|docs|sheets|slides)\.google\.com\/[^\s"'<>)\]}\]]*/gi;
const GOOGLE_DOC_HOST_RE = /^https?:\/\/(?:drive|docs|sheets|slides)\.google\.com\//i;

const TRAILING_PUNCTUATION_RE = /[.,;:]+$/;

/**
 * Find every Google Drive / Docs / Sheets / Slides URL in a comment body.
 * Returns unique, deduplicated URLs with trailing punctuation stripped
 * and URL fragments removed (a fragment targets the same file).
 */
export function extractDriveUrls(body: string): string[] {
  const matches = body.match(DRIVE_URL_RE) || [];
  const urls = matches.map((m) => m.replace(TRAILING_PUNCTUATION_RE, "").split("#")[0]);
  return [...new Set(urls)];
}

/**
 * Extract the Google Drive file id from a Drive URL. Supports the common
 * shapes: /file/d/{id}, {docs,sheets,slides}.google.com/{kind}/d/{id},
 * /drive/folders/{id}, and ?id= / open?id= / uc?id= forms. Returns null
 * when the URL is not a Google Drive URL or no id can be found.
 */
export function extractDriveFileId(url: string): string | null {
  if (!GOOGLE_DOC_HOST_RE.test(url)) return null;
  const path = url.split("?")[0];
  const fileMatch = path.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return fileMatch[1];
  const folderMatch = path.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];
  const docMatch = path.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (docMatch) return docMatch[1];
  const queryMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (queryMatch) return queryMatch[1];
  return null;
}

export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  iconLink?: string;
}

/**
 * Resolve file metadata from the Drive API, trying each drive-linked
 * Google account in turn until one has access to the file. Returns null
 * when no linked account can see it.
 */
export async function findDriveFile(
  accounts: LinkedGoogleAccount[],
  fileId: string
): Promise<DriveFileMetadata | null> {
  for (const account of accounts) {
    const meta = await fetchGoogleAPI<DriveFileMetadata>(
      account,
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,webViewLink,iconLink`
    );
    if (meta?.name) return meta;
  }
  return null;
}

export interface SyncTaskCommentsResult {
  ok: boolean;
  error?: string | null;
  docCount: number;
}

/**
 * Scan the team's task comments for Google Drive URLs and upsert each
 * unique file into team_documents with source 'task_comment', keeping the
 * task -> project -> team context. Metadata is resolved from the linked
 * Google accounts so the list renders even without an active session to
 * Google, falling back to the raw comment URL.
 */
export async function syncTaskCommentDocs(teamId: string): Promise<SyncTaskCommentsResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in", docCount: 0 };

  const { data: projects } = await supabase
    .from("projects")
    .select("id")
    .eq("team_id", teamId);
  const projectIds = (projects as Array<{ id: string }> | null)?.map((p) => p.id) || [];
  if (projectIds.length === 0) return { ok: true, error: null, docCount: 0 };

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, project_id")
    .in("project_id", projectIds);
  const taskList = (tasks as Array<{ id: string; project_id: string | null }> | null) || [];
  if (taskList.length === 0) return { ok: true, error: null, docCount: 0 };

  const taskProjectMap = new Map(taskList.map((t) => [t.id, t.project_id]));

  const comments: Array<{ task_id: string; body: string }> = [];
  const CHUNK = 200;
  for (let i = 0; i < taskList.length; i += CHUNK) {
    const { data } = await supabase
      .from("task_comments")
      .select("task_id, body")
      .in("task_id", taskList.slice(i, i + CHUNK).map((t) => t.id))
      .or(
        "body.ilike.%drive.google.com%,body.ilike.%docs.google.com%,body.ilike.%sheets.google.com%,body.ilike.%slides.google.com%"
      );
    if (data) comments.push(...(data as Array<{ task_id: string; body: string }>));
  }

  const accounts = (await getLinkedAccounts(user.id)).filter((a) => a.scope.includes("drive"));

  const rows: TeamDocumentRow[] = [];
  const seen = new Set<string>();

  for (const comment of comments) {
    for (const url of extractDriveUrls(comment.body)) {
      const fileId = extractDriveFileId(url);
      if (!fileId || seen.has(fileId)) continue;
      seen.add(fileId);
      const meta = accounts.length > 0 ? await findDriveFile(accounts, fileId) : null;
      rows.push({
        source: "task_comment",
        task_id: comment.task_id,
        project_id: taskProjectMap.get(comment.task_id) ?? null,
        drive_file_id: fileId,
        title: meta?.name || fileId,
        mime_type: meta?.mimeType ?? null,
        web_view_link: meta?.webViewLink || url,
        icon_link: meta?.iconLink ?? null,
      });
    }
  }

  if (rows.length === 0) return { ok: true, error: null, docCount: 0 };

  const { error } = await supabase.rpc("sync_team_documents", {
    p_team_id: teamId,
    p_rows: rows,
  });

  if (error) return { ok: false, error: error.message, docCount: rows.length };
  return { ok: true, error: null, docCount: rows.length };
}
