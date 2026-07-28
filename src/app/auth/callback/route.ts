import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const ALLOWED_REDIRECTS = ["/", "/projects", "/dashboard", "/my-tasks", "/teams", "/calendar", "/settings"];

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const inviteEmail = searchParams.get("invite");

  const safeRedirect = ALLOWED_REDIRECTS.includes(next) ? next : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        await acceptPendingInvites(supabase, user.id, user.email, inviteEmail);
      }
      return NextResponse.redirect(`${origin}${safeRedirect}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
}

async function acceptPendingInvites(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  userEmail: string,
  inviteEmailHint: string | null,
) {
  const targetEmail = (inviteEmailHint ?? userEmail).toLowerCase();
  const { data: invites } = await supabase
    .from("team_invites")
    .select("*")
    .eq("status", "pending");

  if (!invites) return;

  const matching = invites.filter(
    (i) => i.email.toLowerCase() === userEmail.toLowerCase() || i.email.toLowerCase() === targetEmail,
  );

  for (const invite of matching) {
    await supabase.from("team_members").upsert(
      {
        team_id: invite.team_id,
        user_id: userId,
        role: invite.role,
        joined_at: new Date().toISOString(),
      },
      { onConflict: "team_id,user_id" },
    );

    await supabase
      .from("team_invites")
      .update({ status: "accepted" })
      .eq("id", invite.id);
  }
}
