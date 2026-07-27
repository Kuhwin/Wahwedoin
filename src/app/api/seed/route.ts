import { requireAuth } from "@/lib/security";
import { NextResponse } from "next/server";

export async function POST() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { error } = await auth.supabase!
    .from("organizations")
    .upsert({ name: "Default Team", slug: "default-team" }, { onConflict: "slug" });

  if (error) {
    return NextResponse.json({ error: "Failed to seed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
