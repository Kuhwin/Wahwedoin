import { requireAuth } from "@/lib/security";
import { rateLimit } from "@/lib/rateLimit";
import { NextResponse } from "next/server";

export async function POST() {
  const auth = await requireAuth();
  if (auth.error || !auth.user) return auth.error ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await rateLimit(`seed:${auth.user.id}`, 3, 300_000))) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  // Create the default org only if it doesn't already exist. A plain upsert
  // would attempt an UPDATE on conflict, which RLS blocks for non-owners and
  // would otherwise let an owner rename a shared org.
  const { error } = await auth.supabase!
    .from("organizations")
    .upsert({ name: "Default Organization", slug: "default-org" }, { onConflict: "slug", ignoreDuplicates: true });

  if (error) {
    return NextResponse.json({ error: "Failed to seed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
