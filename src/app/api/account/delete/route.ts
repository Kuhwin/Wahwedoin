import { NextResponse } from "next/server";
import { getServiceClient, requireAuth } from "@/lib/security";

export async function POST() {
  const { user, supabase, error } = await requireAuth();
  if (!user || !supabase) return error;

  const { error: rpcError } = await supabase.rpc("delete_own_account");
  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  // Best-effort cleanup of avatar objects under the user's folder. The
  // account is already gone, so a storage failure must not surface as an
  // account-deletion failure.
  try {
    const service = getServiceClient();
    const { data: objects } = await service.storage
      .from("avatars")
      .list(user.id, { limit: 1000 });
    if (objects && objects.length > 0) {
      await service.storage
        .from("avatars")
        .remove(objects.map((o) => `${user.id}/${o.name}`));
    }
  } catch {
    // ignore storage cleanup failures
  }

  return NextResponse.json({ ok: true });
}
