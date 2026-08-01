import type { SupabaseClient } from "@supabase/supabase-js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

export interface GoogleAccount {
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

export interface GoogleToken {
  access_token: string;
  expires_in?: number;
}

export async function refreshGoogleAccessToken(
  account: Pick<GoogleAccount, "refresh_token">
): Promise<GoogleToken | null> {
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
  return {
    access_token: tokens.access_token as string,
    expires_in: tokens.expires_in as number | undefined,
  };
}

export async function getValidGoogleToken(
  supabase: SupabaseClient,
  account: GoogleAccount
): Promise<string | null> {
  if (!account.token_expires_at) return account.access_token;
  if (new Date(account.token_expires_at) > new Date()) return account.access_token;
  if (!account.refresh_token) return null;

  const token = await refreshGoogleAccessToken(account);
  if (!token) return null;

  const expiresAt = new Date(Date.now() + (token.expires_in || 3600) * 1000).toISOString();
  await supabase
    .from("user_google_accounts")
    .update({
      access_token: token.access_token,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", account.id);

  return token.access_token;
}
