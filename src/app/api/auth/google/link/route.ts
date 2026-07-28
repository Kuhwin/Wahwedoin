import { NextResponse } from "next/server";
import { requireAuth, hmacSign } from "@/lib/security";
import { rateLimit } from "@/lib/rateLimit";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  if (!(await rateLimit(`google-link:${auth.user!.id}`, 5, 300_000))) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/auth/google/link/callback`;

  const statePayload = JSON.stringify({ uid: auth.user!.id, ts: Date.now() });
  const signature = await hmacSign(statePayload);
  const state = `${Buffer.from(statePayload).toString("base64url")}.${signature}`;

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}
