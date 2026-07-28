"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAllAccountsGmail } from "@/lib/linkedAccounts";
import { Mail, Inbox as InboxIcon, Loader2, ExternalLink } from "lucide-react";
import Avatar from "@/components/ui/Avatar";

interface GmailMessage {
  id: string;
  gmailId: string;
  snippet: string;
  subject: string;
  from: string;
  source: string;
}

interface AccountGmail {
  accountEmail: string;
  accountName: string;
  accountColor: string;
  unreadCount: number;
  messages: GmailMessage[];
}

function extractName(from: string) {
  const match = from.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : from;
}

export default function GmailPage() {
  const [accounts, setAccounts] = useState<AccountGmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const results = await fetchAllAccountsGmail(user.id);
        setAccounts(results);
        if (results.length === 0) {
          setError("no_accounts");
        }
      } catch {
        setError("Failed to load Gmail messages.");
      }
      setLoading(false);
    }
    void load();
  }, [supabase]);

  const totalUnread = accounts.reduce((sum, a) => sum + a.unreadCount, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            Gmail
            {totalUnread > 0 && (
              <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded-full">
                {totalUnread} unread
              </span>
            )}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Unread emails from your connected Google accounts
          </p>
        </div>
      </div>

      {error === "no_accounts" ? (
        <div className="text-center py-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl">
          <Mail size={48} className="text-slate-200 dark:text-slate-700 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">No Google accounts connected</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Connect a Google account with Gmail access to see your emails here.
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
        <div className="space-y-6">
          {accounts.map((account) => (
            <div key={account.accountEmail}>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: account.accountColor }}>
                  {(account.accountName || account.accountEmail).charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {account.accountName}
                  </h2>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {account.accountEmail}
                    {account.unreadCount > 0 && (
                      <span className="ml-2" style={{ color: account.accountColor }}>
                        {account.unreadCount} unread
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {account.messages.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-8 text-center">
                  <InboxIcon size={32} className="text-slate-200 dark:text-slate-700 mx-auto mb-2" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">All caught up!</p>
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-700/50">
                  {account.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className="flex items-start gap-3 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <div className="mt-0.5 flex-shrink-0">
                        <div className="h-8 w-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${account.accountColor}20` }}>
                          <Mail size={14} style={{ color: account.accountColor }} />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {extractName(msg.from)}
                          </p>
                          <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: account.accountColor }} />
                        </div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                          {msg.subject}
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                          {msg.snippet}
                        </p>
                      </div>
                      <a
                        href={`https://mail.google.com/mail/u/0/#inbox/${msg.gmailId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                        title="Open in Gmail"
                      >
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
