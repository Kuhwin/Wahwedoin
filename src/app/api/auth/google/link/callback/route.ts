import { NextResponse } from "next/server";
import { getServiceClient, hmacVerify } from "@/lib/security";
import { rateLimit } from "@/lib/rateLimit";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

export async function GET(request: Request) {
  if (!rateLimit("google-callback", 10, 300_000)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL("/settings?tab=account&error=auth_failed", request.url));
  }

  if (!code || !state || !state.includes(".")) {
    return NextResponse.redirect(new URL("/settings?tab=account&error=missing_params", request.url));
  }

  let userId: string;
  try {
    const [payloadB64, signature] = state.split(".");
    const payload = Buffer.from(payloadB64, "base64url").toString();
    const valid = await hmacVerify(payload, signature);
    if (!valid) {
      return NextResponse.redirect(new URL("/settings?tab=account&error=invalid_state", request.url));
    }
    const parsed = JSON.parse(payload);
    if (Date.now() - parsed.ts > 10 * 60 * 1000) {
      return NextResponse.redirect(new URL("/settings?tab=account&error=state_expired", request.url));
    }
    userId = parsed.uid;
  } catch {
    return NextResponse.redirect(new URL("/settings?tab=account&error=invalid_state", request.url));
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: `${new URL(request.url).origin}/api/auth/google/link/callback`,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenRes.json();
    if (tokens.error) {
      return NextResponse.redirect(new URL("/settings?tab=account&error=token_failed", request.url));
    }

    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userInfo = await userInfoRes.json();

    const supabase = getServiceClient();

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    const PALETTE = [
      '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
      '#ec4899', '#f43f5e', '#ef4444', '#f97316',
      '#f59e0b', '#eab308', '#84cc16', '#22c55e',
      '#10b981', '#14b8a6', '#06b6d4', '#3b82f6',
    ];

    const { count } = await supabase
      .from("user_google_accounts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    const color = PALETTE[(count || 0) % PALETTE.length];

    const { error: dbError } = await supabase.from("user_google_accounts").upsert(
      {
        user_id: userId,
        google_user_id: userInfo.id,
        email: userInfo.email,
        display_name: userInfo.name || null,
        avatar_url: userInfo.picture || null,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        token_expires_at: expiresAt,
        scope: tokens.scope || "",
        color,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,google_user_id" }
    );

    if (dbError) {
      return NextResponse.redirect(new URL("/settings?tab=account&error=save_failed", request.url));
    }

    return NextResponse.redirect(new URL("/settings?tab=account&linked=success", request.url));
  } catch {
    return NextResponse.redirect(new URL("/settings?tab=account&error=server_error", request.url));
  }
}
