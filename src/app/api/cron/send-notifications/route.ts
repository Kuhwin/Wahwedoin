import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { getServiceClient } from "@/lib/security";
import { sendEmail } from "@/lib/email";
import { checkDueDatesServer } from "@/lib/dueDateServer";
import { checkRecurringTasksServer } from "@/lib/recurringTaskServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const expected = process.env.CRON_SECRET;

  // Constant-time comparison via SHA-256 digests so the cron secret length
  // and value aren't leaked through string comparison timing.
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const providedDigest = createHash("sha256").update(provided).digest();
  const expectedDigest = createHash("sha256").update(expected || "").digest();

  if (!expected || !provided || !timingSafeEqual(providedDigest, expectedDigest)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();

  // Run server-side due date check and recurring task generation
  // before dispatching emails
  const dueDateCount = await checkDueDatesServer();
  const recurringCount = await checkRecurringTasksServer();

  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, user_id, title, body, link, created_at")
    .is("email_sent_at", null)
    .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
    .order("created_at", { ascending: true })
    .limit(50);

  if (!notifications || notifications.length === 0) {
    return NextResponse.json({ dueDateNotifications: dueDateCount, recurringTasksCreated: recurringCount, emailSent: 0 });
  }

  // listUsers is paginated (default 50) — page through so emails reach every
  // user, not just the first page.
  const userEmailMap = new Map<string, string>();
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data } = await supabase.auth.admin.listUsers({ page, perPage });
    const users = data?.users || [];
    for (const u of users) userEmailMap.set(u.id, u.email || "");
    if (users.length < perPage) break;
  }

  let sent = 0;

  for (const notif of notifications) {
    const email = userEmailMap.get(notif.user_id);
    if (!email) continue;

    try {
      const result = await sendEmail({
        to: email,
        subject: notif.title,
        body: notif.body || notif.title,
        link: notif.link || undefined,
      });

      // Only mark as sent when the email actually went out, so failures are
      // retried on the next run instead of being permanently lost.
      if (!result.success) continue;

      await supabase
        .from("notifications")
        .update({ email_sent_at: new Date().toISOString() })
        .eq("id", notif.id);

      sent++;
    } catch (err) {
      console.error(`[cron] Failed to email notification ${notif.id}:`, err);
    }
  }

  return NextResponse.json({ dueDateNotifications: dueDateCount, recurringTasksCreated: recurringCount, emailSent: sent });
}
