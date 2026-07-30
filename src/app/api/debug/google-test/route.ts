import { NextResponse } from "next/server";
import { requireAuth, getServiceClient } from "@/lib/security";

export async function GET() {
  const auth = await requireAuth();
  if (auth.error || !auth.user) return auth.error ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const results: Record<string, unknown>[] = [];
  const supabase = getServiceClient();

  const { data: accounts } = await supabase
    .from("user_google_accounts")
    .select("id, email, google_user_id, access_token, refresh_token, token_expires_at, scope")
    .eq("user_id", auth.user.id);

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ message: "No accounts linked", accounts: [] });
  }

  for (const a of accounts) {
    const row: Record<string, unknown> = {
      email: a.email,
      hasCalendarScope: a.scope?.includes("calendar") ?? false,
      tokenValid: a.token_expires_at ? new Date(a.token_expires_at) > new Date() : "no_expiry",
      hasRefreshToken: !!a.refresh_token,
    };

    if (!a.scope?.includes("calendar")) {
      row.status = "skipped - no calendar scope";
      results.push(row);
      continue;
    }

    let token = a.access_token;
    if (a.token_expires_at && new Date(a.token_expires_at) <= new Date()) {
      if (!a.refresh_token) {
        row.status = "expired - no refresh token";
        results.push(row);
        continue;
      }
      const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          refresh_token: a.refresh_token,
          grant_type: "refresh_token",
        }),
      });
      const refreshData = await refreshRes.json();
      if (!refreshRes.ok || refreshData.error) {
        row.status = `refresh failed: ${refreshData.error || refreshRes.status}`;
        results.push(row);
        continue;
      }
      token = refreshData.access_token;
    }

    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + 14 * 86400000).toISOString();
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=10`;

    const gcalRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const gcalData = await gcalRes.json();

    row.status = gcalRes.ok ? "ok" : `google_api_error: ${gcalRes.status}`;
    row.eventCount = gcalData.items?.length ?? 0;
    row.firstEvent = gcalData.items?.[0]?.summary ?? null;
    row.response = gcalData;
    results.push(row);
  }

  return NextResponse.json({ results });
}
