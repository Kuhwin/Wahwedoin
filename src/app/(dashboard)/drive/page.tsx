"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAllAccountsDrive, fetchDriveFolder } from "@/lib/linkedAccounts";
import { FileText, ExternalLink, FolderOpen, Search, ChevronRight } from "lucide-react";
import Avatar from "@/components/ui/Avatar";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  modifiedTime?: string;
  iconLink?: string;
  parents?: string[];
  source: string;
}

interface AccountDrive {
  accountEmail: string;
  accountName: string;
  accountColor: string;
  accountId: string;
  files: DriveFile[];
}

interface Breadcrumb {
  id: string | null;
  name: string;
}

function getFileIcon(mimeType: string) {
  if (mimeType.includes("folder")) return <FolderOpen size={20} className="text-amber-500" />;
  if (mimeType.includes("spreadsheet")) return <FileText size={20} className="text-green-500" />;
  if (mimeType.includes("document")) return <FileText size={20} className="text-blue-500" />;
  if (mimeType.includes("presentation")) return <FileText size={20} className="text-orange-500" />;
  if (mimeType.includes("pdf")) return <FileText size={20} className="text-red-500" />;
  if (mimeType.includes("image")) return <FileText size={20} className="text-pink-500" />;
  return <FileText size={20} className="text-slate-400" />;
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
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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

export default function DrivePage() {
  const [accounts, setAccounts] = useState<AccountDrive[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [currentAccount, setCurrentAccount] = useState<AccountDrive | null>(null);
  const [folderStack, setFolderStack] = useState<Breadcrumb[]>([{ id: null, name: "My Drive" }]);
  const [folderFiles, setFolderFiles] = useState<DriveFile[] | null>(null);
  const [loadingFolder, setLoadingFolder] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const results = await fetchAllAccountsDrive(user.id);
        setAccounts(results);
        if (results.length === 0) {
          setError("no_accounts");
        } else if (results.length === 1) {
          setCurrentAccount(results[0]);
        }
      } catch {
        setError("Failed to load Drive files.");
      }
      setLoading(false);
    }
    void load();
  }, [supabase]);

  const navigateFolder = useCallback(async (accountId: string, folderId: string, folderName: string) => {
    setLoadingFolder(true);
    setFolderStack((prev) => [...prev, { id: folderId, name: folderName }]);
    try {
      const files = await fetchDriveFolder(accountId, folderId);
      setFolderFiles(sortFiles(files));
    } catch {
      setFolderFiles([]);
    }
    setLoadingFolder(false);
  }, []);

  const navigateTo = useCallback(async (index: number) => {
    const account = currentAccount;
    if (!account) return;

    const newStack = folderStack.slice(0, index + 1);
    setFolderStack(newStack);

    const target = newStack[newStack.length - 1];
    if (target.id === null) {
      setFolderFiles(null);
    } else {
      setLoadingFolder(true);
      try {
        const files = await fetchDriveFolder(account.accountId, target.id);
        setFolderFiles(sortFiles(files));
      } catch {
        setFolderFiles([]);
      }
      setLoadingFolder(false);
    }
  }, [currentAccount, folderStack]);

  const allFiles = currentAccount ? currentAccount.files : accounts.flatMap((a) => a.files);
  const rootFiles = folderFiles ?? sortFiles(allFiles);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <div className="h-8 w-24 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          <div className="h-4 w-64 bg-slate-100 dark:bg-slate-800 rounded mt-2 animate-pulse" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl">
              <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" />
              <div>
                <div className="h-4 w-40 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                <div className="h-3 w-56 bg-slate-100 dark:bg-slate-800 rounded mt-1 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Drive</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {currentAccount ? `Browsing ${currentAccount.accountName}` : "Files from your connected Google accounts"}
          </p>
        </div>
      </div>

      {error === "no_accounts" ? (
        <div className="text-center py-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl">
          <FolderOpen size={48} className="text-slate-200 dark:text-slate-700 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">No Google accounts connected</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Connect a Google account with Drive access to see your files here.
          </p>
          <a
            href="/settings?tab=account"
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Go to Settings
          </a>
        </div>
      ) : error ? (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      ) : (
        <>
          {/* Account selector (if multiple) */}
          {!currentAccount && accounts.length > 1 && (
            <div className="space-y-3 mb-6">
              {accounts.map((account) => (
                <button
                  key={account.accountId}
                  onClick={() => {
                    setCurrentAccount(account);
                    setFolderStack([{ id: null, name: "My Drive" }]);
                    setFolderFiles(null);
                  }}
                  className="w-full flex items-center gap-3 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-indigo-300 dark:hover:border-indigo-600 transition-all text-left"
                >
                  <div className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ backgroundColor: account.accountColor }}>
                    {(account.accountName || account.accountEmail).charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{account.accountName}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{account.accountEmail} — {account.files.length} files</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {currentAccount && (
            <>
              {/* Back to accounts */}
              {accounts.length > 1 && (
                <button
                  onClick={() => { setCurrentAccount(null); setFolderStack([{ id: null, name: "My Drive" }]); setFolderFiles(null); }}
                  className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium mb-3"
                >
                  ← All accounts
                </button>
              )}

              {/* Search */}
              <div className="relative mb-4">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search files..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Breadcrumbs */}
              <div className="flex items-center gap-1 mb-4 text-sm flex-wrap">
                {folderStack.map((crumb, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    {idx > 0 && <ChevronRight size={14} className="text-slate-300 dark:text-slate-600" />}
                    <button
                      onClick={() => void navigateTo(idx)}
                      className={`px-1.5 py-0.5 rounded transition-colors ${
                        idx === folderStack.length - 1
                          ? "font-semibold text-slate-900 dark:text-slate-100"
                          : "text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                      }`}
                    >
                      {crumb.name}
                    </button>
                  </div>
                ))}
              </div>

              {/* Back button if in a folder */}
              {folderStack.length > 1 && (
                <button
                  onClick={() => void navigateTo(folderStack.length - 2)}
                  className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium mb-3"
                >
                  ← Back to {folderStack[folderStack.length - 2].name}
                </button>
              )}

              {/* File list */}
              {loadingFolder ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-slate-200 dark:border-slate-700 border-t-indigo-600 rounded-full animate-spin" />
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                  <div className="grid grid-cols-1 divide-y divide-slate-100 dark:divide-slate-700/50">
                    {(() => {
                      const displayFiles = search
                        ? rootFiles.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
                        : rootFiles;

                      if (displayFiles.length === 0) {
                        return (
                          <div className="py-12 text-center">
                            <FolderOpen size={32} className="text-slate-200 dark:text-slate-700 mx-auto mb-2" />
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                              {search ? "No files match your search" : "This folder is empty"}
                            </p>
                          </div>
                        );
                      }

                      return displayFiles.map((file) => (
                        <div
                          key={file.id}
                          className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <div className="flex-shrink-0">
                            {file.iconLink ? (
                              <img src={file.iconLink} alt="" className="w-5 h-5" />
                            ) : (
                              getFileIcon(file.mimeType)
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            {file.mimeType.includes("folder") ? (
                              <button
                                onClick={() => void navigateFolder(currentAccount.accountId, file.id, file.name)}
                                className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 truncate text-left"
                              >
                                {file.name}
                              </button>
                            ) : (
                              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                                {file.name}
                              </p>
                            )}
                            <p className="text-xs text-slate-400 dark:text-slate-500">
                              {formatMime(file.mimeType)}
                              {file.modifiedTime && ` · ${formatTime(file.modifiedTime)}`}
                            </p>
                          </div>
                          {file.webViewLink && (
                            <a
                              href={file.webViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                              title="Open in Google Drive"
                            >
                              <ExternalLink size={14} />
                            </a>
                          )}
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
