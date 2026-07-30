import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/security";
import { sendEmail, buildNotificationEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const { user_id, title, body, link } = await req.json();

  if (!user_id || !title) {
    return NextResponse.json({ error: "user_id and title are required" }, { status: 400 });
  }

  const supabase = getServiceClient();

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("display_name")
    .eq("user_id", user_id)
    .single();

  const userName = profile?.display_name || "there";

  const { data: authUser } = await supabase.auth.admin.getUserById(user_id);
  const email = authUser?.user?.email;

  if (!email) {
    return NextResponse.json({ error: "User has no email" }, { status: 400 });
  }

  const { subject, body: emailBody, link: emailLink } = buildNotificationEmail(userName, title, body || title, link);

  const result = await sendEmail({ to: email, subject, body: emailBody, link: emailLink });

  if (!result.success) {
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }

  return NextResponse.json({ sent: true });
}
