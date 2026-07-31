import { NextResponse } from "next/server";
import { requireAuth, getServiceClient } from "@/lib/security";
import { rateLimit } from "@/lib/rateLimit";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

interface GoogleAccount {
  id: string;
  user_id: string;
  email: string;
  google_user_id: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  scope: string;
  color: string | null;
}

async function refreshAccessToken(account: GoogleAccount): Promise<string | null> {
  if (!account.refresh_token) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: account.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  const tokens = await res.json();
  if (tokens.error || !tokens.access_token) return null;

  return tokens.access_token as string;
}

async function getValidToken(supabase: ReturnType<typeof getServiceClient>, account: GoogleAccount): Promise<string | null> {
  if (!account.token_expires_at) return account.access_token;
  if (new Date(account.token_expires_at) > new Date()) return account.access_token;
  if (!account.refresh_token) return null;

  const newToken = await refreshAccessToken(account);
  if (!newToken) return null;

  const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
  await supabase
    .from("user_google_accounts")
    .update({
      access_token: newToken,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", account.id);

  return newToken;
}

interface GoogleCalendarItem {
  id: string;
  summary: string;
  description?: string;
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
  htmlLink: string;
  hangoutLink?: string;
  attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const auth = await requireAuth();
  if (auth.error || !auth.user) return auth.error ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const days = Math.min(parseInt(searchParams.get("days") || "14", 10), 90);

  const { userId } = await params;
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  if (!(await rateLimit(`people-calendar:${auth.user.id}`, 30, 60_000))) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const supabase = getServiceClient();

  const { data: adminMemberships } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", auth.user.id);

  const isAdmin = (adminMemberships || []).some(
    (m: { role: string }) => m.role === "owner" || m.role === "admin"
  );
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { data: teamMemberships } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId);
  const teamIds = (teamMemberships || []).map((t: { team_id: string }) => t.team_id);

  const { data: accounts } = await supabase
    .from("user_google_accounts")
    .select("id, user_id, email, google_user_id, access_token, refresh_token, token_expires_at, scope, color")
    .eq("user_id", userId);
  const googleAccounts = (accounts || []) as GoogleAccount[];
  const accountIds = googleAccounts.map((a) => a.id);

  const now = new Date();
  const startISO = now.toISOString();
  const endISO = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

  const orFilters: string[] = [];
  if (teamIds.length > 0) orFilters.push(`team_id.in.(${teamIds.join(",")})`);
  if (accountIds.length > 0) orFilters.push(`google_account_id.in.(${accountIds.join(",")})`);

  let internalEvents: Array<{
    id: string;
    title: string;
    description: string | null;
    start_date: string;
    end_date: string;
    color: string;
    all_day: boolean;
    meet_link: string | null;
    team_id: string;
    google_event_id: string | null;
    google_account_id: string | null;
    attendees: Array<{ email: string; name?: string; status?: string }> | null;
  }> = [];

  if (orFilters.length > 0) {
    const { data } = await supabase
      .from("events")
      .select("id, title, description, start_date, end_date, color, all_day, meet_link, team_id, google_event_id, google_account_id, attendees")
      .or(orFilters.join(","))
      .gte("start_date", startISO)
      .lte("start_date", endISO)
      .order("start_date", { ascending: true })
      .limit(50);
    internalEvents = (data || []) as typeof internalEvents;
  }

  const externalEvents: Array<{
    id: string;
    title: string;
    description: string;
    start: string;
    end: string;
    allDay: boolean;
    color: string;
    source: string;
    meetLink: string | null;
    attendees: Array<{ email: string; name?: string; status?: string }>;
  }> = [];

  await Promise.all(
    googleAccounts.map(async (account) => {
      if (!account.scope?.includes("calendar")) return;
      const token = await getValidToken(supabase, account);
      if (!token) return;

      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${startISO}&timeMax=${endISO}&singleEvents=true&orderBy=startTime&maxResults=50`;

      try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
          console.warn(`[calendar] Google API error ${res.status} for ${account.email}`);
          return;
        }
        const data = (await res.json()) as { items?: GoogleCalendarItem[] };
        const items = data.items || [];
        for (const e of items) {
          externalEvents.push({
            id: `gcal:${account.google_user_id}:${e.id}`,
            title: e.summary || "(No title)",
            description: e.description || "",
            start: e.start.dateTime || e.start.date || "",
            end: e.end.dateTime || e.end.date || "",
            allDay: !!e.start.date,
            color: account.color || "#6366f1",
            source: account.email,
            meetLink: e.hangoutLink || null,
            attendees: (e.attendees || []).map((att) => ({
              email: att.email,
              name: att.displayName || att.email,
              status: att.responseStatus || "needsAction",
            })),
          });
        }
      } catch {
        // skip this account
      }
    })
  );

  const accountEmailMap = new Map(googleAccounts.map((a) => [a.id, a.email]));

  const merged = [
    ...internalEvents.map((e) => ({
      id: `db:${e.id}`,
      title: e.title,
      description: e.description || "",
      start: e.start_date,
      end: e.end_date,
      allDay: e.all_day,
      color: e.color,
      source: e.google_account_id ? accountEmailMap.get(e.google_account_id) || "Google Calendar" : "Internal",
      meetLink: e.meet_link,
      attendees: e.attendees || [],
      _sort: new Date(e.start_date).getTime(),
    })),
    ...externalEvents.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      start: e.start,
      end: e.end,
      allDay: e.allDay,
      color: e.color,
      source: e.source,
      meetLink: e.meetLink,
      attendees: e.attendees,
      _sort: new Date(e.start).getTime(),
    })),
  ];

  merged.sort((a, b) => a._sort - b._sort);
  const result = merged.slice(0, 30).map((m) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _sort, ...rest } = m;
    return rest;
  });

  return NextResponse.json({ events: result });
}
