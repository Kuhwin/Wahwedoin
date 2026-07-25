import { createClient } from "@/lib/supabase/client";
import type { LinkedGoogleAccount } from "@/lib/types";

export type { LinkedGoogleAccount };

export async function getLinkedAccounts(userId: string): Promise<LinkedGoogleAccount[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("user_google_accounts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (data || []) as LinkedGoogleAccount[];
}

async function refreshAccessToken(account: LinkedGoogleAccount): Promise<string | null> {
  if (!account.refresh_token) return null;

  const res = await fetch("/api/auth/google/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account_id: account.id, refresh_token: account.refresh_token }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token || null;
}

export async function getValidToken(account: LinkedGoogleAccount): Promise<string> {
  if (account.token_expires_at && new Date(account.token_expires_at) > new Date()) {
    return account.access_token;
  }
  const refreshed = await refreshAccessToken(account);
  return refreshed || account.access_token;
}

export async function fetchGoogleAPI<T>(
  account: LinkedGoogleAccount,
  url: string
): Promise<T | null> {
  const token = await getValidToken(account);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json() as Promise<T>;
}

export async function fetchAllAccountsCalendar(userId: string) {
  const accounts = await getLinkedAccounts(userId);
  const calendarAccounts = accounts.filter((a) => a.scope.includes("calendar"));

  const results = await Promise.all(
    calendarAccounts.map(async (account) => {
      const now = new Date();
      const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const timeMax = new Date(now.getFullYear(), now.getMonth() + 3, now.getDate()).toISOString();

      const data = await fetchGoogleAPI<{
        items: Array<{
          id: string;
          summary: string;
          description?: string;
          start: { date?: string; dateTime?: string };
          end: { date?: string; dateTime?: string };
          htmlLink: string;
        }>;
      }>(
        account,
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=100`
      );

      return {
        accountEmail: account.email,
        accountName: account.display_name || account.email,
        events: (data?.items || []).map((e) => ({
          id: `${account.google_user_id}:${e.id}`,
          title: e.summary,
          start: e.start.dateTime || e.start.date || "",
          end: e.end.dateTime || e.end.date || "",
          description: e.description || "",
          allDay: !!e.start.date,
          source: account.email,
          color: account.id.slice(0, 7),
        })),
      };
    })
  );

  return results;
}

export async function fetchAllAccountsDrive(userId: string) {
  const accounts = await getLinkedAccounts(userId);
  const driveAccounts = accounts.filter((a) => a.scope.includes("drive"));

  const results = await Promise.all(
    driveAccounts.map(async (account) => {
      const data = await fetchGoogleAPI<{
        files: Array<{
          id: string;
          name: string;
          mimeType: string;
          webViewLink?: string;
          modifiedTime?: string;
          iconLink?: string;
          parents?: string[];
        }>;
      }>(
        account,
        `https://www.googleapis.com/drive/v3/files?pageSize=100&fields=files(id,name,mimeType,webViewLink,modifiedTime,iconLink,parents)&q=trashed%3Dfalse&orderBy=name`
      );

      return {
        accountEmail: account.email,
        accountName: account.display_name || account.email,
        accountId: account.id,
        files: (data?.files || []).map((f) => ({
          ...f,
          source: account.email,
        })),
      };
    })
  );

  return results;
}

export async function fetchDriveFolder(accountId: string, folderId: string) {
  const accounts = await getLinkedAccounts("");
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return [];

  const data = await fetchGoogleAPI<{
    files: Array<{
      id: string;
      name: string;
      mimeType: string;
      webViewLink?: string;
      modifiedTime?: string;
      iconLink?: string;
      parents?: string[];
    }>;
  }>(
    account,
    `https://www.googleapis.com/drive/v3/files?pageSize=100&fields=files(id,name,mimeType,webViewLink,modifiedTime,iconLink,parents)&q=trashed%3Dfalse+'${folderId}'+in+parents&orderBy=name`
  );

  return (data?.files || []).map((f) => ({
    ...f,
    source: account.email,
  }));
}

export async function fetchAllAccountsGmail(userId: string) {
  const accounts = await getLinkedAccounts(userId);
  const gmailAccounts = accounts.filter((a) => a.scope.includes("gmail"));

  const results = await Promise.all(
    gmailAccounts.map(async (account) => {
      const listData = await fetchGoogleAPI<{
        messages: Array<{ id: string }>;
      }>(
        account,
        `https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=is:unread`
      );

      if (!listData?.messages?.length) {
        return {
          accountEmail: account.email,
          accountName: account.display_name || account.email,
          unreadCount: 0,
          messages: [],
        };
      }

      const messages = await Promise.all(
        listData.messages.slice(0, 20).map(async (msg) => {
          const detail = await fetchGoogleAPI<{
            id: string;
            snippet: string;
            payload?: {
              headers: Array<{ name: string; value: string }>;
            };
          }>(
            account,
            `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`
          );

          if (!detail) return null;

          return {
            id: detail.id,
            gmailId: msg.id,
            snippet: detail.snippet,
            subject: detail.payload?.headers?.find((h) => h.name === "Subject")?.value || "(no subject)",
            from: detail.payload?.headers?.find((h) => h.name === "From")?.value || "",
            source: account.email,
          };
        })
      );

      return {
        accountEmail: account.email,
        accountName: account.display_name || account.email,
        unreadCount: listData.messages.length,
        messages: messages.filter(Boolean) as Array<{
          id: string;
          gmailId: string;
          snippet: string;
          subject: string;
          from: string;
          source: string;
        }>,
      };
    })
  );

  return results;
}
