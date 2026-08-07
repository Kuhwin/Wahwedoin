import { getServiceClient } from "@/lib/security";

export type CheckStatus = "ok" | "degraded" | "down" | "unconfigured";

export interface HealthCheck {
  key: string;
  label: string;
  status: CheckStatus;
  latencyMs?: number;
  detail?: string;
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * Lightweight end-to-end database check (service role bypasses RLS). A 3s
 * cap keeps the liveness endpoint responsive when Supabase is slow or down.
 */
export async function checkDatabase(): Promise<HealthCheck> {
  const started = Date.now();
  try {
    const supabase = getServiceClient();
    const { error } = await withTimeout(
      supabase.from("user_profiles").select("user_id").limit(1),
      3000
    );
    if (error) {
      return { key: "database", label: "Database", status: "down", latencyMs: Date.now() - started, detail: "Supabase query failed" };
    }
    return { key: "database", label: "Database", status: "ok", latencyMs: Date.now() - started };
  } catch {
    return { key: "database", label: "Database", status: "down", latencyMs: Date.now() - started, detail: "Unreachable or not configured" };
  }
}

/**
 * Verifies Google OAuth is configured and the token endpoint is reachable.
 * An HTTP response of any kind (even 4xx) means the network path is healthy.
 */
export async function checkGoogle(): Promise<HealthCheck> {
  const started = Date.now();
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return { key: "google", label: "Google OAuth", status: "unconfigured", latencyMs: Date.now() - started };
  }
  try {
    const res = await withTimeout(
      fetch("https://accounts.google.com/.well-known/openid-configuration", { method: "GET", cache: "no-store" }),
      3000
    );
    if (res.ok) {
      return { key: "google", label: "Google OAuth", status: "ok", latencyMs: Date.now() - started };
    }
    return { key: "google", label: "Google OAuth", status: "degraded", latencyMs: Date.now() - started, detail: `Unexpected response ${res.status}` };
  } catch {
    return { key: "google", label: "Google OAuth", status: "down", latencyMs: Date.now() - started, detail: "Unreachable" };
  }
}

/**
 * Verifies the Resend API key is present and accepted. A 401 means the key is
 * invalid; a network failure means the Resend API is down.
 */
export async function checkResend(): Promise<HealthCheck> {
  const started = Date.now();
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return { key: "resend", label: "Email (Resend)", status: "unconfigured", latencyMs: Date.now() - started };
  }
  try {
    const res = await withTimeout(
      fetch("https://api.resend.com/domains", { method: "GET", headers: { Authorization: `Bearer ${key}` }, cache: "no-store" }),
      3000
    );
    if (res.ok) {
      return { key: "resend", label: "Email (Resend)", status: "ok", latencyMs: Date.now() - started };
    }
    if (res.status === 401) {
      return { key: "resend", label: "Email (Resend)", status: "degraded", latencyMs: Date.now() - started, detail: "API key rejected" };
    }
    return { key: "resend", label: "Email (Resend)", status: "degraded", latencyMs: Date.now() - started, detail: `Unexpected response ${res.status}` };
  } catch {
    return { key: "resend", label: "Email (Resend)", status: "down", latencyMs: Date.now() - started, detail: "Unreachable" };
  }
}

export function checkApp(): HealthCheck {
  return { key: "app", label: "App", status: "ok", detail: process.env.NEXT_PUBLIC_APP_URL || undefined };
}

export function overallStatus(checks: HealthCheck[]): CheckStatus {
  if (checks.some((c) => c.status === "down")) return "down";
  if (checks.some((c) => c.status === "degraded")) return "degraded";
  return "ok";
}
