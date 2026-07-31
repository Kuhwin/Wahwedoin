"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { getLinkedAccounts, fetchDriveFolder, type LinkedGoogleAccount } from "@/lib/linkedAccounts";
import { FileText, FolderOpen, ExternalLink, ChevronRight, Link2, Unlink, Loader2, Search, X, Check } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  modifiedTime?: string;
  iconLink?: string;
  parents?: string[];
}

interface DriveLinkPanelProps {
  tableName: "teams" | "projects";
  recordId: string;
  accountId?: string | null;
  folderId?: string | null;
  folderName?: string | null;
  onLinked: () => void;
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

function formatTime(date?: string) {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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

export default function DriveLinkPanel({ tableName, recordId, accountId, folderId, folderName, onLinked }: DriveLinkPanelProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [accounts, setAccounts] = useState<LinkedGoogleAccount[]>([]);
  const [linkedAccount, setLinkedAccount] = useState<LinkedGoogleAccount | null>(null);
  const [currentFolder, setCurrentFolder] = useState<{ id: string | null; name: string }>({ id: null, name: "My Drive" });
  const [folderStack, setFolderStack] = useState<{ id: string | null; name: string }[]>([]);
  const [files, setFiles] = useState<DriveFile[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const { addToast } = useToast();
  const supabase = createClient();

  useEffect(() => {
    if (!showPicker) return;
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const accts = await getLinkedAccounts(user.id);
      const driveAccts = accts.filter((a) => a.scope.includes("drive"));
      setAccounts(driveAccts);
      if (driveAccts.length === 1) {
        setLinkedAccount(driveAccts[0]);
        setCurrentFolder({ id: null, name: "My Drive" });
        setFolderStack([]);
        const root = await fetchDriveFolder(driveAccts[0].id, "root");
        setFiles(sortFiles(root));
      }
      setLoading(false);
    })();
  }, [showPicker, supabase]);

  const openAccount = useCallback(async (account: LinkedGoogleAccount) => {
    setLinkedAccount(account);
    setCurrentFolder({ id: null, name: "My Drive" });
    setFolderStack([]);
    setLoading(true);
    const root = await fetchDriveFolder(account.id, "root");
    setFiles(sortFiles(root));
    setLoading(false);
  }, []);

  const openFolder = useCallback(async (folder: { id: string; name: string }) => {
    if (!linkedAccount) return;
    setFolderStack((prev) => [...prev, currentFolder]);
    setCurrentFolder(folder);
    setLoading(true);
    const children = await fetchDriveFolder(linkedAccount.id, folder.id);
    setFiles(sortFiles(children));
    setLoading(false);
  }, [linkedAccount, currentFolder]);

  const goBack = useCallback(async () => {
    if (folderStack.length === 0) return;
    const prev = folderStack[folderStack.length - 1];
    setFolderStack((prevStack) => prevStack.slice(0, -1));
    setCurrentFolder(prev);
    if (!linkedAccount) return;
    setLoading(true);
    const children = await fetchDriveFolder(linkedAccount.id, prev.id === null ? "root" : prev.id);
    setFiles(sortFiles(children));
    setLoading(false);
  }, [folderStack, linkedAccount]);

  const linkFolderFromFile = useCallback((file: DriveFile) => {
    setCurrentFolder({ id: file.id, name: file.name });
  }, []);

  const linkFolder = useCallback(async () => {
    if (!linkedAccount || !currentFolder.id || !currentFolder.name) return;
    setSaving(true);
    const { error } = await supabase
      .from(tableName)
      .update({
        drive_account_id: linkedAccount.id,
        drive_folder_id: currentFolder.id,
        drive_folder_name: currentFolder.name,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recordId);
    setSaving(false);
    if (error) {
      addToast(error.message || "Failed to link folder", "error");
      return;
    }
    addToast(`Linked "${currentFolder.name}"`, "success");
    setShowPicker(false);
    onLinked();
  }, [linkedAccount, currentFolder, tableName, recordId, supabase, addToast, onLinked]);

  const unlinkFolder = useCallback(async () => {
    if (!window.confirm("Unlink this Drive folder?")) return;
    const { error } = await supabase
      .from(tableName)
      .update({ drive_account_id: null, drive_folder_id: null, drive_folder_name: null, updated_at: new Date().toISOString() })
      .eq("id", recordId);
    if (error) {
      addToast(error.message || "Failed to unlink folder", "error");
      return;
    }
    addToast("Drive folder unlinked", "success");
    onLinked();
  }, [tableName, recordId, supabase, addToast, onLinked]);

  const [folderFiles, setFolderFiles] = useState<DriveFile[] | null>(null);
  const [loadingFolderFiles, setLoadingFolderFiles] = useState(false);

  useEffect(() => {
    if (!accountId || !folderId) { setFolderFiles(null); return; }
    let cancelled = false;
    (async () => {
      setLoadingFolderFiles(true);
      const supabaseClient = createClient();
      const { data } = await supabaseClient
        .from("user_google_accounts")
        .select("*")
        .eq("id", accountId)
        .single();
      if (data) {
        const account = data as LinkedGoogleAccount;
        const children = await fetchDriveFolder(account.id, folderId);
        if (!cancelled) setFolderFiles(sortFiles(children));
      }
      if (!cancelled) setLoadingFolderFiles(false);
    })();
    return () => { cancelled = true; };
  }, [accountId, folderId]);

  const displayFiles = search
    ? (files || []).filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
    : files || [];

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <FolderOpen size={16} className="text-amber-500" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Google Drive</h3>
          {folderName && (
            <span className="text-xs text-slate-400 dark:text-slate-500">· {folderName}</span>
          )}
        </div>
        {folderName ? (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowPicker(true)}>
              <Link2 size={12} /> Change Folder
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void unlinkFolder()} className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
              <Unlink size={12} /> Unlink
            </Button>
          </div>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setShowPicker(true)}>
            <Link2 size={12} /> Link Folder
          </Button>
        )}
      </div>

      {folderName && (
        <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
          {loadingFolderFiles ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-slate-300 dark:text-slate-600" />
            </div>
          ) : !folderFiles || folderFiles.length === 0 ? (
            <div className="py-8 text-center">
              <FolderOpen size={24} className="text-slate-200 dark:text-slate-700 mx-auto mb-2" />
              <p className="text-xs text-slate-400 dark:text-slate-500">This folder is empty</p>
            </div>
          ) : (
            folderFiles.slice(0, 10).map((file) => (
              <div key={file.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="flex-shrink-0">
                  {file.iconLink ? (
                    <Image src={file.iconLink} alt="" width={16} height={16} className="w-4 h-4" unoptimized />
                  ) : (
                    getFileIcon(file.mimeType)
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-800 dark:text-slate-200 truncate">{file.name}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {formatMime(file.mimeType)}
                    {file.modifiedTime && ` · ${formatTime(file.modifiedTime)}`}
                  </p>
                </div>
                {file.webViewLink && (
                  <a href={file.webViewLink} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-accent hover:bg-accent/10 transition-colors" title="Open in Google Drive">
                    <ExternalLink size={13} />
                  </a>
                )}
              </div>
            ))
          )}
          {folderFiles && folderFiles.length > 10 && (
            <div className="px-5 py-2 text-xs text-slate-400 dark:text-slate-500">
              +{folderFiles.length - 10} more files
            </div>
          )}
        </div>
      )}

      <Modal open={showPicker} onClose={() => setShowPicker(false)} title="Link a Google Drive Folder" size="lg">
        <div className="space-y-4">
          {accounts.length === 0 ? (
            <div className="text-center py-10">
              <FolderOpen size={40} className="text-slate-200 dark:text-slate-700 mx-auto mb-3" />
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">No Google accounts with Drive access linked</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Link a Google account in Settings first.</p>
              <a href="/settings?tab=account" onClick={() => setShowPicker(false)} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white" style={{ backgroundColor: "var(--accent)" }}>
                Go to Settings
              </a>
            </div>
          ) : (
            <>
              {!linkedAccount && (
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
              )}

              {linkedAccount && (
                <>
                  <div className="flex items-center justify-between gap-3">
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
                    {folderStack.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => void goBack()}>← Back</Button>
                    )}
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
                        return (
                          <div
                            key={file.id}
                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                          >
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
                            {isFolder && (
                              <button
                                onClick={() => void linkFolderFromFile(file)}
                                className={cn(
                                  "flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors",
                                  currentFolder.id === file.id
                                    ? "text-white"
                                    : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                                )}
                                style={currentFolder.id === file.id ? { backgroundColor: "var(--accent)" } : undefined}
                              >
                                {currentFolder.id === file.id ? <><Check size={11} /> Linked</> : <><Link2 size={11} /> Link</>}
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {currentFolder.id && (
                    <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-2 min-w-0">
                        <FolderOpen size={14} className="text-amber-500 flex-shrink-0" />
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{currentFolder.name}</p>
                      </div>
                      <Button size="sm" onClick={() => void linkFolder()} disabled={saving}>
                        {saving ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
                        {saving ? "Linking..." : "Link this folder"}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
