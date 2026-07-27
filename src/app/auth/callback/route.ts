import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const ALLOWED_REDIRECTS = ["/", "/projects", "/dashboard", "/my-tasks", "/teams", "/calendar", "/settings"];

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  const safeRedirect = ALLOWED_REDIRECTS.includes(next) ? next : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${safeRedirect}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
}
