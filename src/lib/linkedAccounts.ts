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

export async function getValidToken(account: LinkedGoogleAccount): Promise<string | null> {
  if (!account.token_expires_at) return account.access_token;
  if (new Date(account.token_expires_at) > new Date()) return account.access_token;
  if (!account.refresh_token) return null;
  return refreshAccessToken(account);
}

export async function fetchGoogleAPI<T>(
  account: LinkedGoogleAccount,
  url: string
): Promise<T | null> {
  const token = await getValidToken(account);
  if (!token) {
    console.warn(`[google] Token expired for ${account.email}, account needs re-linking`);
    return null;
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.warn(`[google] API error ${res.status} for ${account.email}`);
    return null;
  }
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
          hangoutLink?: string;
          attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>;
        }>;
      }>(
        account,
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=100`
      );

      return {
        accountEmail: account.email,
        accountName: account.display_name || account.email,
        accountColor: account.color || "#6366f1",
        events: (data?.items || []).map((e) => ({
          id: `${account.google_user_id}:${e.id}`,
          title: e.summary,
          start: e.start.dateTime || e.start.date || "",
          end: e.end.dateTime || e.end.date || "",
          description: e.description || "",
          allDay: !!e.start.date,
          source: account.email,
          color: account.color || "#6366f1",
          meetLink: e.hangoutLink || null,
          attendees: (e.attendees || []).map((a) => ({
            email: a.email,
            name: a.displayName || a.email,
            status: a.responseStatus || "needsAction",
          })),
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
        accountColor: account.color || "#6366f1",
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
  const supabase = createClient();
  const { data } = await supabase
    .from("user_google_accounts")
    .select("*")
    .eq("id", accountId)
    .single();
  if (!data) return [];
  const account = data as LinkedGoogleAccount;

  const files = await fetchGoogleAPI<{
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
    `https://www.googleapis.com/drive/v3/files?pageSize=100&fields=files(id,name,mimeType,webViewLink,modifiedTime,iconLink,parents)&q=${encodeURIComponent(`'${folderId}' in parents and trashed=false`)}&orderBy=name`
  );

  return (files?.files || []).map((f) => ({
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
          accountColor: account.color || "#6366f1",
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
        accountColor: account.color || "#6366f1",
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

async function callGoogleAPI<T>(
  account: LinkedGoogleAccount,
  method: "POST" | "PATCH" | "DELETE",
  url: string,
  body?: unknown
): Promise<T | null> {
  const token = await getValidToken(account);
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) return null;
  if (method === "DELETE") return {} as T;
  return res.json() as Promise<T>;
}

export async function createGoogleCalendarEvent(
  accountId: string,
  eventData: {
    title: string;
    description: string | null;
    start: string;
    end: string;
    allDay: boolean;
    meetLink?: string | null;
    attendees?: { email: string }[];
    timezone?: string;
  }
): Promise<{ googleEventId: string; hangoutLink?: string | null } | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("user_google_accounts")
    .select("*")
    .eq("id", accountId)
    .single();
  if (!data) return null;
  const account = data as LinkedGoogleAccount;

  const googleEvent: Record<string, unknown> = {
    summary: eventData.title,
    description: eventData.description || "",
    start: eventData.allDay
      ? { date: eventData.start.split("T")[0] }
      : { dateTime: eventData.start, timeZone: eventData.timezone ?? "America/Barbados" },
    end: eventData.allDay
      ? { date: eventData.end.split("T")[0] }
      : { dateTime: eventData.end, timeZone: eventData.timezone ?? "America/Barbados" },
  };

  // Note: hangoutLink is a read-only field on the Google API — sending it
  // alongside conferenceDataVersion=1 makes Google return 400. We request a
  // Google Meet conference instead and read the generated link back.
  if (eventData.meetLink) {
    googleEvent.conferenceData = {
      createRequest: {
        requestId: crypto.randomUUID(),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  if (eventData.attendees && eventData.attendees.length > 0) {
    googleEvent.attendees = eventData.attendees.map((a) => ({ email: a.email }));
  }

  const result = await callGoogleAPI<{ id: string; hangoutLink?: string }>(
    account,
    "POST",
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1",
    googleEvent
  );

  if (!result?.id) return null;
  return { googleEventId: result.id, hangoutLink: result.hangoutLink || null };
}

export async function updateGoogleCalendarEvent(
  accountId: string,
  googleEventId: string,
  eventData: {
    title: string;
    description: string | null;
    start: string;
    end: string;
    allDay: boolean;
    meetLink?: string | null;
    attendees?: { email: string }[];
    timezone?: string;
  }
): Promise<boolean> {
  const supabase = createClient();
  const { data } = await supabase
    .from("user_google_accounts")
    .select("*")
    .eq("id", accountId)
    .single();
  if (!data) return false;
  const account = data as LinkedGoogleAccount;

  const googleEvent: Record<string, unknown> = {
    summary: eventData.title,
    description: eventData.description || "",
    start: eventData.allDay
      ? { date: eventData.start.split("T")[0] }
      : { dateTime: eventData.start, timeZone: eventData.timezone ?? "America/Barbados" },
    end: eventData.allDay
      ? { date: eventData.end.split("T")[0] }
      : { dateTime: eventData.end, timeZone: eventData.timezone ?? "America/Barbados" },
  };

  if (eventData.attendees && eventData.attendees.length > 0) {
    googleEvent.attendees = eventData.attendees.map((a) => ({ email: a.email }));
  }

  const result = await callGoogleAPI<{ id: string }>(
    account,
    "PATCH",
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}`,
    googleEvent
  );

  return !!result?.id;
}

export async function deleteGoogleCalendarEvent(
  accountId: string,
  googleEventId: string
): Promise<boolean> {
  const supabase = createClient();
  const { data } = await supabase
    .from("user_google_accounts")
    .select("*")
    .eq("id", accountId)
    .single();
  if (!data) return false;
  const account = data as LinkedGoogleAccount;

  const result = await callGoogleAPI<null>(
    account,
    "DELETE",
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}`
  );

  return result !== null;
}
