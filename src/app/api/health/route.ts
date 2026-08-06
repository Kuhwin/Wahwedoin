import { NextResponse } from "next/server";
import { checkDatabase } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public liveness endpoint. This is the primary target for the external
 * uptime monitor (e.g. UptimeRobot / BetterStack) and for the Docker
 * HEALTHCHECK on the fallback host.
 *
 * - 200 `{ status: "ok", db: true }`   — app + database healthy
 * - 503 `{ status: "degraded", db: false }` — app is up but the database is
 *   unreachable (monitor will alert on the non-2xx code)
 * - no response — the host itself is down (monitor treats as DOWN)
 *
 * Deliberately exposes no internal detail and performs no authentication.
 */
export async function GET() {
  const db = await checkDatabase();
  const ok = db.status === "ok";
  return NextResponse.json({ status: ok ? "ok" : "degraded", db: ok }, { status: ok ? 200 : 503 });
}
