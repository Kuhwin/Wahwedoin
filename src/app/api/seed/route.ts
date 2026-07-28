import { requireAuth } from "@/lib/security";
import { rateLimit } from "@/lib/rateLimit";
import { NextResponse } from "next/server";

export async function POST() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  if (!rateLimit(`seed:${auth.user!.id}`, 3, 300_000)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const { error } = await auth.supabase!
    .from("organizations")
    .upsert({ name: "Default Team", slug: "default-team" }, { onConflict: "slug" });

  if (error) {
    return NextResponse.json({ error: "Failed to seed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
