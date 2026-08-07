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
  const teamId = searchParams.get("team_id");
  if (!orgId && !teamId) return NextResponse.json({ error: "Missing org_id or team_id" }, { status: 400 });

  if (!(await rateLimit(`people-workload:${auth.user.id}`, 30, 60_000))) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const supabase = getServiceClient();

  let userIds: string[] = [];
  let scopeTeamIds: string[] = [];
  if (orgId) {
    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", auth.user.id)
      .eq("org_id", orgId)
      .maybeSingle();
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    const { data: orgMembers } = await supabase.from("org_members").select("user_id").eq("org_id", orgId);
    userIds = (orgMembers || []).map((m: { user_id: string }) => m.user_id);
    const { data: orgTeams } = await supabase.from("teams").select("id").eq("org_id", orgId);
    scopeTeamIds = (orgTeams || []).map((t: { id: string }) => t.id);
  } else if (teamId) {
    const { data: membership } = await supabase
      .from("team_members")
      .select("role")
      .eq("user_id", auth.user.id)
      .eq("team_id", teamId)
      .maybeSingle();
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    const { data: teamMembers } = await supabase.from("team_members").select("user_id").eq("team_id", teamId);
    userIds = (teamMembers || []).map((m: { user_id: string }) => m.user_id);
    scopeTeamIds = [teamId];
  }

  if (userIds.length === 0) return NextResponse.json({ members: [] });

  const [{ data: profiles }, { data: assignments }, { data: legacyTasks }] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("user_id, timezone")
      .in("user_id", userIds),
    supabase
      .from("task_assignees")
      .select("user_id, tasks!inner(id, status, due_date)")
      .in("user_id", userIds),
    supabase
      .from("tasks")
      .select("id, assignee_id, status, due_date, projects!inner(team_id)")
      .in("assignee_id", userIds)
      .in("projects.team_id", scopeTeamIds),
  ]);

  const tzMap = new Map(
    (profiles || []).map((p: { user_id: string; timezone: string | null }) => [p.user_id, p.timezone || DEFAULT_TIMEZONE]),
  );

  const tasks: WorkloadTaskInput[] = [];
  const seenTasks = new Set<string>();
  const addTask = (taskId: string, userId: string, status: string, dueDate: string | null) => {
    const key = `${taskId}:${userId}`;
    if (seenTasks.has(key)) return;
    seenTasks.add(key);
    tasks.push({ user_id: userId, status, due_date: dueDate });
  };
  (assignments || []).forEach((row: { user_id: string; tasks: { id: string; status: string; due_date: string | null }[] }) => {
    (row.tasks || []).forEach((t) => addTask(t.id, row.user_id, t.status, t.due_date));
  });
  (legacyTasks || []).forEach((task: { id: string; assignee_id: string | null; status: string; due_date: string | null }) => {
    if (task.assignee_id) addTask(task.id, task.assignee_id, task.status, task.due_date);
  });

  const members = buildWorkloadRows(tasks, tzMap);

  return NextResponse.json({ members });
}
