import { NextRequest, NextResponse } from "next/server";
import { getServiceClient, requireAuth } from "@/lib/security";
import { sendEmail, buildNotificationEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const { user_id, title, body, link } = await req.json();

  if (!user_id || !title) {
    return NextResponse.json({ error: "user_id and title are required" }, { status: 400 });
  }

  const { user: caller, error } = await requireAuth();
  if (!caller) return error;

  const allowed = await rateLimit(`send-assignment:${caller.id}`, 100, 60 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const supabase = getServiceClient();

  // Notifications link to a project — the caller must belong to that project's
  // team, and the target must too, or anyone with an account could spam emails
  // to any app user.
  const projectId = link?.match(/^\/projects\/([^/?]+)/)?.[1] || null;

  if (projectId) {
    const { data: project } = await supabase
      .from("projects")
      .select("team_id")
      .eq("id", projectId)
      .single();

    if (!project?.team_id) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const { data: callerMember } = await supabase
      .from("team_members")
      .select("id")
      .eq("team_id", project.team_id)
      .eq("user_id", caller.id)
      .maybeSingle();

    if (!callerMember) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: targetMember } = await supabase
      .from("team_members")
      .select("id")
      .eq("team_id", project.team_id)
      .eq("user_id", user_id)
      .maybeSingle();

    if (!targetMember) {
      return NextResponse.json({ error: "Target is not a member of this project's team" }, { status: 403 });
    }
  }

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
