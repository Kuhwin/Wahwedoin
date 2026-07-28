import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function requireAuth() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, supabase: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return { user, supabase, error: null };
}

export function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }

  return createServiceClient(url, key);
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "metadata.google.internal",
  "169.254.169.254",
]);

function isPrivateIP(hostname: string): boolean {
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.)/.test(hostname)) return true;
  if (/^fc00:/i.test(hostname) || /^fe80:/i.test(hostname)) return true;
  if (hostname === "::1" || hostname === "::") return true;
  return false;
}

export function isSafeUrl(urlString: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;
  if (BLOCKED_HOSTNAMES.has(parsed.hostname)) return false;
  if (isPrivateIP(parsed.hostname)) return false;
  if (/\.internal$/i.test(parsed.hostname)) return false;

  return true;
}

function getHmacSecret(): string {
  const secret = process.env.OAUTH_STATE_SECRET;
  if (!secret) throw new Error("OAUTH_STATE_SECRET env var is required for HMAC signing");
  return secret;
}

export async function hmacSign(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getHmacSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Buffer.from(signature).toString("base64url");
}

export async function hmacVerify(data: string, signature: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getHmacSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const sig = Buffer.from(signature, "base64url");
  return crypto.subtle.verify("HMAC", key, sig, encoder.encode(data));
}
