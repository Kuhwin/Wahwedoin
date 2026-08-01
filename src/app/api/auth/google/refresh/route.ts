import { NextResponse } from "next/server";
import { requireAuth, getServiceClient } from "@/lib/security";
import { rateLimit } from "@/lib/rateLimit";
import { refreshGoogleAccessToken } from "@/lib/googleServer";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.error || !auth.user) return auth.error ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await rateLimit(`google-refresh:${auth.user.id}`, 20, 60_000))) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: { account_id?: string; refresh_token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { account_id, refresh_token } = body;

  if (!refresh_token || !account_id) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  const supabase = getServiceClient();

  const { data: account } = await supabase
    .from("user_google_accounts")
    .select("user_id")
    .eq("id", account_id)
    .single();

  if (!account || account.user_id !== auth.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const tokens = await refreshGoogleAccessToken({ refresh_token });
  if (!tokens) {
    return NextResponse.json({ error: "Token refresh failed" }, { status: 400 });
  }

  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

  await supabase
    .from("user_google_accounts")
    .update({ access_token: tokens.access_token, token_expires_at: expiresAt, updated_at: new Date().toISOString() })
    .eq("id", account_id);

  return NextResponse.json({ access_token: tokens.access_token, expires_at: expiresAt });
}
