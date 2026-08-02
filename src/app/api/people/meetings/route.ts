import { NextResponse } from "next/server";
import { requireAuth, getServiceClient } from "@/lib/security";
import { rateLimit } from "@/lib/rateLimit";
import { getValidGoogleToken, type GoogleAccount } from "@/lib/googleServer";
import { buildUserMeetingCounts, type MeetingEventRow } from "@/lib/people";

interface GoogleCalendarItem {
  id: string;
  summary: string;
  start: { date?: string; dateTime?: string };
}

const DAYS = 14;

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth.error || !auth.user) return auth.error ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("org_id");
  if (!orgId) return NextResponse.json({ error: "Missing org_id" }, { status: 400 });

  if (!(await rateLimit(`people-meetings:${auth.user.id}`, 30, 60_000))) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const supabase = getServiceClient();

  const { data: membership } = await supabase
    .from("org_members")
    .select("role")
    .eq("user_id", auth.user.id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { data: orgMembers } = await supabase
    .from("org_members")
    .select("user_id")
    .eq("org_id", orgId);
  const userIds = (orgMembers || []).map((m: { user_id: string }) => m.user_id);

  const counts: Record<string, number> = {};
  userIds.forEach((id) => { counts[id] = 0; });
  if (userIds.length === 0) return NextResponse.json({ counts });

  const { data: teamMemberships } = await supabase
    .from("team_members")
    .select("user_id, team_id")
    .in("user_id", userIds);

  const userTeamSet: Record<string, Set<string>> = {};
  userIds.forEach((id) => { userTeamSet[id] = new Set(); });
  const teamIds: string[] = [];
  (teamMemberships || []).forEach((t: { user_id: string; team_id: string }) => {
    userTeamSet[t.user_id]?.add(t.team_id);
    if (!teamIds.includes(t.team_id)) teamIds.push(t.team_id);
  });

  const { data: accounts } = await supabase
    .from("user_google_accounts")
    .select("id, user_id, email, google_user_id, access_token, refresh_token, token_expires_at, scope, color")
    .in("user_id", userIds);
  const googleAccounts = (accounts || []) as GoogleAccount[];

  const userAccountSet: Record<string, Set<string>> = {};
  userIds.forEach((id) => { userAccountSet[id] = new Set(); });
  const accountIds: string[] = [];
  googleAccounts.forEach((a) => {
    userAccountSet[a.user_id]?.add(a.id);
    if (!accountIds.includes(a.id)) accountIds.push(a.id);
  });

  const now = new Date();
  const startISO = now.toISOString();
  const endISO = new Date(now.getTime() + DAYS * 24 * 60 * 60 * 1000).toISOString();

  const orFilters: string[] = [];
  if (teamIds.length > 0) orFilters.push(`team_id.in.(${teamIds.join(",")})`);
  if (accountIds.length > 0) orFilters.push(`google_account_id.in.(${accountIds.join(",")})`);

  if (orFilters.length > 0) {
    const { data: events } = await supabase
      .from("events")
      .select("team_id, google_account_id")
      .or(orFilters.join(","))
      .gte("start_date", startISO)
      .lte("start_date", endISO);

    const meetingCounts = buildUserMeetingCounts(
      userIds,
      (events || []) as MeetingEventRow[],
      userTeamSet,
      userAccountSet,
    );
    Object.entries(meetingCounts).forEach(([uid, n]) => { counts[uid] = n; });
  }

  await Promise.all(
    googleAccounts.map(async (account) => {
      try {
        if (!account.scope?.includes("calendar")) return;
        const token = await getValidGoogleToken(supabase, account);
        if (!token) return;

        const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${startISO}&timeMax=${endISO}&singleEvents=true&orderBy=startTime&maxResults=100`;

        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
          console.warn(`[meetings] Google API error ${res.status} for ${account.email}`);
          return;
        }
        const data = (await res.json()) as { items?: GoogleCalendarItem[] };
        const n = (data.items || []).length;
        const uid = account.user_id;
        if (counts[uid] !== undefined) counts[uid] += n;
      } catch {
        // skip this account
      }
    })
  );

  return NextResponse.json({ counts });
}
