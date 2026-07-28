import { NextResponse } from "next/server";
import { requireAuth, getServiceClient } from "@/lib/security";
import { rateLimit } from "@/lib/rateLimit";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  if (!(await rateLimit(`google-refresh:${auth.user!.id}`, 20, 60_000))) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const { account_id, refresh_token } = await request.json();

  if (!refresh_token || !account_id) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  const supabase = getServiceClient();

  const { data: account } = await supabase
    .from("user_google_accounts")
    .select("user_id")
    .eq("id", account_id)
    .single();

  if (!account || account.user_id !== auth.user!.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token,
      grant_type: "refresh_token",
    }),
  });

  const tokens = await res.json();
  if (tokens.error) {
    return NextResponse.json({ error: "Token refresh failed" }, { status: 400 });
  }

  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

  await supabase
    .from("user_google_accounts")
    .update({ access_token: tokens.access_token, token_expires_at: expiresAt, updated_at: new Date().toISOString() })
    .eq("id", account_id);

  return NextResponse.json({ access_token: tokens.access_token, expires_at: expiresAt });
}
