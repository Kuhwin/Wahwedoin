"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import {
  getLinkedAccounts,
  fetchDriveFolder,
  type LinkedGoogleAccount,
} from "@/lib/linkedAccounts";
import { upsertTeamDocuments } from "@/lib/teamDocuments";
import { FileText, FolderOpen, Folder, ChevronRight, Loader2, Search, Check, Link2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  iconLink?: string;
}

interface DrivePickerProps {
  open: boolean;
  onClose: () => void;
  teamId: string;
  defaultProjectId?: string | null;
}

function getFileIcon(mimeType: string) {
  if (mimeType.includes("folder")) return <FolderOpen size={16} className="text-amber-500" />;
  if (mimeType.includes("spreadsheet")) return <FileText size={16} className="text-green-500" />;
  if (mimeType.includes("document")) return <FileText size={16} className="text-blue-500" />;
  if (mimeType.includes("presentation")) return <FileText size={16} className="text-orange-500" />;
  if (mimeType.includes("pdf")) return <FileText size={16} className="text-red-500" />;
  if (mimeType.includes("image")) return <FileText size={16} className="text-pink-500" />;
  return <FileText size={16} className="text-slate-400" />;
}

function formatMime(mimeType: string) {
  if (mimeType.includes("folder")) return "Folder";
  if (mimeType.includes("spreadsheet")) return "Spreadsheet";
  if (mimeType.includes("document")) return "Document";
  if (mimeType.includes("presentation")) return "Presentation";
  if (mimeType.includes("pdf")) return "PDF";
  if (mimeType.includes("image")) return "Image";
  return "File";
}

function sortFiles(files: DriveFile[]) {
  return [...files].sort((a, b) => {
    const aIsFolder = a.mimeType.includes("folder");
    const bIsFolder = b.mimeType.includes("folder");
    if (aIsFolder && !bIsFolder) return -1;
    if (!aIsFolder && bIsFolder) return 1;
    return a.name.localeCompare(b.name);
  });
}

export default function DrivePicker({ open, onClose, teamId, defaultProjectId }: DrivePickerProps) {
  const [accounts, setAccounts] = useState<LinkedGoogleAccount[]>([]);
  const [linkedAccount, setLinkedAccount] = useState<LinkedGoogleAccount | null>(null);
  const [currentFolder, setCurrentFolder] = useState<{ id: string | null; name: string }>({
    id: null,
    name: "My Drive",
  });
  const [folderStack, setFolderStack] = useState<{ id: string | null; name: string }[]>([]);
  const [files, setFiles] = useState<DriveFile[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [projectId, setProjectId] = useState<string | null>(defaultProjectId ?? null);
  const [teamFolder, setTeamFolder] = useState<{ accountId: string | null; folderId: string | null; name: string | null }>({
    accountId: null,
    folderId: null,
    name: null,
  });
  const { addToast } = useToast();
  const supabase = createClient();

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const accts = (await getLinkedAccounts(user.id)).filter((a) => a.scope.includes("drive"));
      setAccounts(accts);
      setLinkedAccount(accts.length === 1 ? accts[0] : null);
      if (accts.length === 1) {
        const root = await fetchDriveFolder(accts[0].id, "root");
        setFiles(sortFiles(root));
      }
      setSelected(new Set());
      setSearch("");

      const { data: team } = await supabase
        .from("teams")
        .select("drive_account_id, drive_folder_id, drive_folder_name")
        .eq("id", teamId)
        .single();
      if (team) {
        setTeamFolder({
          accountId: team.drive_account_id ?? null,
          folderId: team.drive_folder_id ?? null,
          name: team.drive_folder_name ?? null,
        });
      }

      const projs = (await supabase
        .from("projects")
        .select("id, name")
        .eq("team_id", teamId)
        .order("name", { ascending: true })) as { data: Array<{ id: string; name: string }> | null };
      setProjects(projs.data || []);
      setProjectId((prev) => prev && projs.data?.some((p) => p.id === prev) ? prev : null);
      setLoading(false);
    })();
  }, [open, teamId, supabase]);

  const openAccount = useCallback(async (account: LinkedGoogleAccount) => {
    setLinkedAccount(account);
    setCurrentFolder({ id: null, name: "My Drive" });
    setFolderStack([]);
    setSelected(new Set());
    setLoading(true);
    const root = await fetchDriveFolder(account.id, "root");
    setFiles(sortFiles(root));
    setLoading(false);
  }, []);

  const openFolder = useCallback(async (folder: { id: string; name: string }) => {
    if (!linkedAccount) return;
    setFolderStack((prev) => [...prev, currentFolder]);
    setCurrentFolder(folder);
    setSelected(new Set());
    setLoading(true);
    const children = await fetchDriveFolder(linkedAccount.id, folder.id);
    setFiles(sortFiles(children));
    setLoading(false);
  }, [linkedAccount, currentFolder]);

  const goBack = useCallback(async () => {
    if (folderStack.length === 0 || !linkedAccount) return;
    const prev = folderStack[folderStack.length - 1];
    setFolderStack((prevStack) => prevStack.slice(0, -1));
    setCurrentFolder(prev);
    setSelected(new Set());
    setLoading(true);
    const children = await fetchDriveFolder(linkedAccount.id, prev.id === null ? "root" : prev.id);
    setFiles(sortFiles(children));
    setLoading(false);
  }, [folderStack, linkedAccount]);

  const browseTeamFolder = useCallback(async () => {
    if (!teamFolder.accountId || !teamFolder.folderId) {
      addToast("This team has no linked Drive folder yet", "info");
      return;
    }
    const account = accounts.find((a) => a.id === teamFolder.accountId) || linkedAccount;
    if (!account) {
      addToast("Link the team's Drive account to browse its folder", "error");
      return;
    }
    setLinkedAccount(account);
    setCurrentFolder({ id: null, name: "My Drive" });
    setFolderStack([]);
    setSelected(new Set());
    setLoading(true);
    const children = await fetchDriveFolder(account.id, teamFolder.folderId);
    setCurrentFolder({ id: teamFolder.folderId, name: teamFolder.name || "Team folder" });
    setFiles(sortFiles(children));
    setLoading(false);
  }, [teamFolder, accounts, linkedAccount, addToast]);

  const toggleFile = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const addSelected = useCallback(async () => {
    if (!linkedAccount || selected.size === 0) return;
    setSaving(true);
    const fileById = new Map((files || []).map((f) => [f.id, f]));
    const rows = Array.from(selected)
      .map((id) => fileById.get(id))
      .filter((f): f is DriveFile => !!f && !f.mimeType.includes("folder"))
      .map((f) => ({
        source: "drive_picker" as const,
        project_id: projectId || null,
        drive_file_id: f.id,
        title: f.name,
        mime_type: f.mimeType,
        web_view_link: f.webViewLink ?? null,
        icon_link: f.iconLink ?? null,
      }));

    if (rows.length === 0) {
      addToast("Select at least one file to add", "error");
      setSaving(false);
      return;
    }

    const res = await upsertTeamDocuments(teamId, rows);
    setSaving(false);
    if (!res.ok) {
      addToast(res.error || "Failed to add to Docs", "error");
      return;
    }
    addToast(`Added ${rows.length} ${rows.length === 1 ? "document" : "documents"} to Docs`, "success");
    onClose();
  }, [linkedAccount, selected, files, projectId, teamId, addToast, onClose]);

  const displayFiles = useMemo(() => {
    const list = files || [];
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter((f) => f.name.toLowerCase().includes(q));
  }, [files, search]);

  const folderCount = (files || []).filter((f) => f.mimeType.includes("folder")).length;
  const fileCount = (files || []).length - folderCount;

  return (
    <Modal open={open} onClose={onClose} title="Add from Google Drive" size="lg">
      <div className="space-y-4">
        {accounts.length === 0 ? (
          <div className="text-center py-10">
            <FolderOpen size={40} className="text-slate-200 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">No Google accounts with Drive access linked</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Link a Google account in Settings first.</p>
            <a href="/settings?tab=account" onClick={() => onClose()} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white" style={{ backgroundColor: "var(--accent)" }}>
              Go to Settings
            </a>
          </div>
        ) : (
          <>
            {!linkedAccount ? (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Choose account</label>
                {accounts.map((acc) => (
                  <button
                    key={acc.id}
                    onClick={() => void openAccount(acc)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-accent/40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all text-left"
                  >
                    <div className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: acc.color || "#6366f1" }}>
                      {(acc.display_name || acc.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{acc.display_name || acc.email}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{acc.email}</p>
                    </div>
                    <ChevronRight size={14} className="ml-auto text-slate-300 dark:text-slate-600" />
                  </button>
                ))}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: linkedAccount.color || "#6366f1" }}>
                      {(linkedAccount.display_name || linkedAccount.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{linkedAccount.display_name || linkedAccount.email}</p>
                      <div className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                        {folderStack.length > 0 && (
                          <button onClick={() => void openAccount(linkedAccount)} className="hover:text-accent">My Drive</button>
                        )}
                        {folderStack.map((crumb, idx) => (
                          <span key={idx} className="flex items-center gap-1">
                            <ChevronRight size={10} />
                            <span>{crumb.name}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {teamFolder.accountId && teamFolder.folderId && (
                      <Button variant="secondary" size="sm" onClick={() => void browseTeamFolder()}>
                        <Folder size={12} /> Browse team folder
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => { setLinkedAccount(null); setFiles(null); setCurrentFolder({ id: null, name: "My Drive" }); setFolderStack([]); setSelected(new Set()); }}>
                      Switch account
                    </Button>
                    {folderStack.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => void goBack()}>← Back</Button>
                    )}
                  </div>
                </div>

                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search files and folders..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
                  />
                </div>

                <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700/50">
                  {loading ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 size={20} className="animate-spin text-slate-300 dark:text-slate-600" />
                    </div>
                  ) : displayFiles.length === 0 ? (
                    <div className="py-10 text-center">
                      <p className="text-sm text-slate-400 dark:text-slate-500">No files found</p>
                    </div>
                  ) : (
                    displayFiles.map((file) => {
                      const isFolder = file.mimeType.includes("folder");
                      const isSelected = selected.has(file.id);
                      return (
                        <div
                          key={file.id}
                          className={cn(
                            "flex items-center gap-3 px-4 py-2.5 transition-colors",
                            !isFolder && "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                          )}
                          onClick={() => { if (!isFolder) toggleFile(file.id); }}
                        >
                          {!isFolder && (
                            <span className={cn(
                              "h-4 w-4 rounded flex items-center justify-center border transition-colors flex-shrink-0",
                              isSelected ? "text-white border-transparent" : "border-slate-300 dark:border-slate-600"
                            )} style={isSelected ? { backgroundColor: "var(--accent)" } : undefined}>
                              {isSelected && <Check size={10} />}
                            </span>
                          )}
                          <div className="flex-shrink-0">
                            {file.iconLink ? (
                              <Image src={file.iconLink} alt="" width={16} height={16} className="w-4 h-4" unoptimized />
                            ) : (
                              getFileIcon(file.mimeType)
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            {isFolder ? (
                              <button
                                onClick={() => void openFolder({ id: file.id, name: file.name })}
                                className="text-sm font-medium text-accent hover:text-indigo-700 dark:hover:text-indigo-300 truncate text-left"
                              >
                                {file.name}
                              </button>
                            ) : (
                              <p className="text-sm text-slate-800 dark:text-slate-200 truncate">{file.name}</p>
                            )}
                            <p className="text-xs text-slate-400 dark:text-slate-500">{formatMime(file.mimeType)}</p>
                          </div>
                          {!isFolder && file.webViewLink && (
                            <a
                              href={file.webViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="flex-shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-accent hover:bg-accent/10 transition-colors"
                              title="Open in Google Drive"
                            >
                              <Link2 size={13} />
                            </a>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {folderCount > 0 && `${folderCount} folder${folderCount === 1 ? "" : "s"}`}
                  {folderCount > 0 && fileCount > 0 && " · "}
                  {fileCount > 0 && `${fileCount} file${fileCount === 1 ? "" : "s"}`}
                </p>

                {projects.length > 0 && (
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Link to project (optional)</label>
                    <select
                      value={projectId || ""}
                      onChange={(e) => setProjectId(e.target.value || null)}
                      className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
                    >
                      <option value="">No project</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button variant="secondary" onClick={onClose}>Cancel</Button>
                  <Button onClick={() => void addSelected()} disabled={saving || selected.size === 0}>
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    {saving ? "Adding..." : `Add to Docs${selected.size > 0 ? ` (${selected.size})` : ""}`}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
