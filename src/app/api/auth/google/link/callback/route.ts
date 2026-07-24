import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const userId = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/settings?tab=account&error=${error}`, request.url));
  }

  if (!code || !userId) {
    return NextResponse.redirect(new URL("/settings?tab=account&error=missing_params", request.url));
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
      return NextResponse.redirect(new URL(`/settings?tab=account&error=${tokens.error_description || tokens.error}`, request.url));
    }

    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userInfo = await userInfoRes.json();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

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
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,google_user_id" }
    );

    if (dbError) {
      console.error("DB error saving linked account:", dbError);
      return NextResponse.redirect(new URL(`/settings?tab=account&error=db_error`, request.url));
    }

    return NextResponse.redirect(new URL("/settings?tab=account&linked=success", request.url));
  } catch (err) {
    console.error("Google link callback error:", err);
    return NextResponse.redirect(new URL("/settings?tab=account&error=server_error", request.url));
  }
}
