"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAllAccountsDrive } from "@/lib/linkedAccounts";
import { FileText, ExternalLink, FolderOpen, Search } from "lucide-react";
import Avatar from "@/components/ui/Avatar";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  modifiedTime?: string;
  iconLink?: string;
  source: string;
}

interface AccountDrive {
  accountEmail: string;
  accountName: string;
  files: DriveFile[];
}

function getFileIcon(mimeType: string) {
  if (mimeType.includes("folder")) return <FolderOpen size={20} className="text-amber-500" />;
  if (mimeType.includes("spreadsheet")) return <FileText size={20} className="text-green-500" />;
  if (mimeType.includes("document")) return <FileText size={20} className="text-blue-500" />;
  if (mimeType.includes("presentation")) return <FileText size={20} className="text-orange-500" />;
  if (mimeType.includes("pdf")) return <FileText size={20} className="text-red-500" />;
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

export default function DrivePage() {
  const [accounts, setAccounts] = useState<AccountDrive[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
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
        }
      } catch {
        setError("Failed to load Drive files.");
      }
      setLoading(false);
    }
    void load();
  }, [supabase]);

  const allFiles = accounts.flatMap((a) => a.files);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-slate-200 dark:border-slate-700 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Drive</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Files from your connected Google accounts
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
          {/* Search */}
          {allFiles.length > 0 && (
            <div className="relative mb-6">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search files..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          )}

          {/* Account sections */}
          {accounts.map((account) => {
            const accountFiles = search
              ? account.files.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
              : account.files;
            if (accountFiles.length === 0) return null;

            return (
              <div key={account.accountEmail} className="mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <Avatar email={account.accountEmail} name={account.accountName} size="sm" />
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {account.accountName}
                    </h2>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{account.accountEmail}</p>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                  <div className="grid grid-cols-1 divide-y divide-slate-100 dark:divide-slate-700/50">
                    {accountFiles.map((file) => (
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
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                            {file.name}
                          </p>
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
                    ))}
                  </div>
                </div>
              </div>
            );
          })}

          {allFiles.length === 0 && !error && (
            <div className="text-center py-20">
              <FolderOpen size={48} className="text-slate-200 dark:text-slate-700 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-1">No files found</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Your connected accounts don&apos;t have any Drive files yet.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
