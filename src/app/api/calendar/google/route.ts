import { NextResponse } from "next/server";
import { requireAuth, getServiceClient } from "@/lib/security";
import { rateLimit } from "@/lib/rateLimit";
import { getValidGoogleToken, type GoogleAccount } from "@/lib/googleServer";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth.error || !auth.user) return auth.error ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await rateLimit(`calendar-google:${auth.user.id}`, 30, 60_000))) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const days = Math.min(parseInt(searchParams.get("days") || "90", 10), 365);

  const supabase = getServiceClient();
  const { data: accounts } = await supabase
    .from("user_google_accounts")
    .select("id, user_id, email, google_user_id, access_token, refresh_token, token_expires_at, scope, color")
    .eq("user_id", auth.user.id);

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ events: [] });
  }

  const now = new Date();
  const startISO = now.toISOString();
  const endISO = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

  const results = await Promise.all(
    accounts.map(async (a) => {
      if (!a.scope?.includes("calendar")) return null;

      const token = await getValidGoogleToken(supabase, a as GoogleAccount);
      if (!token) return null;

      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${startISO}&timeMax=${endISO}&singleEvents=true&orderBy=startTime&maxResults=100`;

      try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
          console.warn(`[calendar] Google API error ${res.status} for ${a.email}`);
          return null;
        }
        const data = (await res.json()) as {
          items?: Array<{
            id: string;
            summary?: string;
            description?: string;
            start?: { date?: string; dateTime?: string };
            end?: { date?: string; dateTime?: string };
            htmlLink?: string;
            hangoutLink?: string;
            attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>;
          }>;
        };
        return {
          accountEmail: a.email,
          accountColor: a.color || "#4285F4",
          events: (data.items || []).map((e) => ({
            id: `${a.google_user_id}:${e.id}`,
            title: e.summary || "(No title)",
            start: e.start?.dateTime || e.start?.date || "",
            end: e.end?.dateTime || e.end?.date || "",
            description: e.description || "",
            allDay: !!e.start?.date,
            source: a.email,
            meetLink: e.hangoutLink || null,
            attendees: (e.attendees || []).map((att) => ({
              email: att.email,
              name: att.displayName || att.email,
              status: att.responseStatus || "needsAction",
            })),
          })),
        };
      } catch {
        return null;
      }
    })
  );

  return NextResponse.json({ events: results.filter(Boolean) });
}
