import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/security";
import { sendEmail } from "@/lib/email";
import { checkDueDatesServer } from "@/lib/dueDateServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();

  // Run server-side due date check before dispatching emails
  const dueDateCount = await checkDueDatesServer();

  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, user_id, title, body, link, created_at")
    .is("email_sent_at", null)
    .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
    .order("created_at", { ascending: true })
    .limit(50);

  if (!notifications || notifications.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  const userIds = [...new Set(notifications.map((n) => n.user_id))];

  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("user_id, display_name");

  const profileMap = new Map((profiles || []).map((p) => [p.user_id, p.display_name || "there"]));

  const { data: authUsers } = await supabase.auth.admin.listUsers();

  const userEmailMap = new Map<string, string>();
  for (const u of authUsers?.users || []) {
    userEmailMap.set(u.id, u.email || "");
  }

  let sent = 0;

  for (const notif of notifications) {
    const email = userEmailMap.get(notif.user_id);
    if (!email) continue;

    const name = profileMap.get(notif.user_id) || "there";

    await sendEmail({
      to: email,
      subject: notif.title,
      body: notif.body || notif.title,
      link: notif.link || undefined,
    });

    await supabase
      .from("notifications")
      .update({ email_sent_at: new Date().toISOString() })
      .eq("id", notif.id);

    sent++;
  }

  return NextResponse.json({ dueDateNotifications: dueDateCount, emailSent: sent });
}
