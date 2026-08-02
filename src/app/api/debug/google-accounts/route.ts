import { NextResponse } from "next/server";
import { requireAuth, getServiceClient } from "@/lib/security";
import { rateLimit } from "@/lib/rateLimit";

function debugEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_DEBUG_ROUTES === "true";
}

export async function GET() {
  if (!debugEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const auth = await requireAuth();
  if (auth.error || !auth.user) return auth.error ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await rateLimit(`debug-google-accounts:${auth.user.id}`, 30, 60_000))) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const supabase = getServiceClient();
  const { data: accounts } = await supabase
    .from("user_google_accounts")
    .select("id, email, google_user_id, token_expires_at, scope, color, created_at, updated_at")
    .eq("user_id", auth.user.id);

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ accounts: [], message: "No Google accounts linked." });
  }

  const now = new Date();
  const result = accounts.map((a) => ({
    id: a.id,
    email: a.email,
    hasScope: a.scope?.includes("calendar") ?? false,
    tokenExpired: a.token_expires_at ? new Date(a.token_expires_at) <= now : "no_expiry_stored",
    tokenExpiresAt: a.token_expires_at,
    scope: a.scope,
    linkedAt: a.created_at,
    updatedAt: a.updated_at,
  }));

  return NextResponse.json({ accounts: result });
}
