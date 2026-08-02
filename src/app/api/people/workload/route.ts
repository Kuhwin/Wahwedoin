import { NextResponse } from "next/server";
import { requireAuth, getServiceClient } from "@/lib/security";
import { rateLimit } from "@/lib/rateLimit";
import { buildWorkloadRows, type WorkloadTaskInput } from "@/lib/workload";
import { DEFAULT_TIMEZONE } from "@/lib/utils";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth.error || !auth.user) return auth.error ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("org_id");
  if (!orgId) return NextResponse.json({ error: "Missing org_id" }, { status: 400 });

  if (!(await rateLimit(`people-workload:${auth.user.id}`, 30, 60_000))) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const supabase = getServiceClient();

  const { data: membership } = await supabase
    .from("org_members")
    .select("role")
    .eq("user_id", auth.user.id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { data: orgMembers } = await supabase
    .from("org_members")
    .select("user_id")
    .eq("org_id", orgId);
  const userIds = (orgMembers || []).map((m: { user_id: string }) => m.user_id);

  if (userIds.length === 0) return NextResponse.json({ members: [] });

  const [{ data: profiles }, { data: assignments }] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("user_id, timezone")
      .in("user_id", userIds),
    supabase
      .from("task_assignees")
      .select("user_id, tasks!inner(status, due_date)")
      .in("user_id", userIds),
  ]);

  const tzMap = new Map(
    (profiles || []).map((p: { user_id: string; timezone: string | null }) => [p.user_id, p.timezone || DEFAULT_TIMEZONE]),
  );

  const tasks: WorkloadTaskInput[] = [];
  (assignments || []).forEach((row: { user_id: string; tasks: { status: string; due_date: string | null }[] }) => {
    (row.tasks || []).forEach((t) => tasks.push({ user_id: row.user_id, status: t.status, due_date: t.due_date }));
  });

  const members = buildWorkloadRows(tasks, tzMap);

  return NextResponse.json({ members });
}
