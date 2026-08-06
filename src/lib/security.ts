import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { promises as dns } from "dns";

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
  const h = hostname.replace(/^::ffff:/i, "").replace(/^\[|\]$/g, "");
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|127\.|0\.)/.test(h)) return true;
  if (/^fc00:/i.test(h) || /^fe80:/i.test(h)) return true;
  if (h === "::1" || h === "::") return true;
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

  // Reject raw IP hosts and integer/hex/octal IPv4 encodings. A hostname
  // like "2130706433" or "0x7f000001" normalizes to 127.0.0.1 on many
  // resolvers and would otherwise bypass the private-range checks above.
  const labels = parsed.hostname.split(".");
  if (labels.every((l) => /^[0-9]+$/.test(l))) return false;
  if (labels.some((l) => /^0x[0-9a-f]+$/i.test(l))) return false;

  return true;
}

/**
 * Resolves a hostname and rejects it when any address is private. This
 * catches SSRF attempts that pass the string-level checks, e.g. hostnames
 * that resolve to loopback or link-local addresses (169.254.x.x).
 */
export async function hostnameResolvesToPrivate(hostname: string): Promise<boolean> {
  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    return records.some((r) => isPrivateIP(r.address));
  } catch {
    // Treat resolution failure as unsafe rather than allowing the request.
    return true;
  }
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
