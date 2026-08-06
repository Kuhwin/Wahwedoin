import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/security";
import { checkApp, checkDatabase, checkGoogle, checkResend, overallStatus, type HealthCheck } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authenticated detailed health report for the in-app /status page.
 * Unlike /api/health (public liveness), this includes per-integration checks
 * for Google OAuth and Resend. Requires a logged-in user.
 */
export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const [db, google, resend] = await Promise.all([checkDatabase(), checkGoogle(), checkResend()]);
  const checks: HealthCheck[] = [checkApp(), db, google, resend];

  return NextResponse.json({ overall: overallStatus(checks), checks, checkedAt: new Date().toISOString() });
}
