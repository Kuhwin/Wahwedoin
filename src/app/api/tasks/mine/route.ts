import { NextResponse } from "next/server";
import { getServiceClient, requireAuth } from "@/lib/security";

export async function GET() {
  const auth = await requireAuth();
  if (auth.error || !auth.user) return auth.error ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const userId = auth.user.id;

  const [{ data: directTasks, error: directError }, { data: linkedRows, error: linkedError }] = await Promise.all([
    supabase.from("tasks").select("id").eq("assignee_id", userId),
    supabase.from("task_assignees").select("task_id").eq("user_id", userId),
  ]);

  if (directError || linkedError) {
    return NextResponse.json({ error: directError?.message || linkedError?.message || "Failed to load assignments" }, { status: 500 });
  }

  const taskIds = [...new Set([
    ...(directTasks || []).map((task: { id: string }) => task.id),
    ...(linkedRows || []).map((row: { task_id: string }) => row.task_id),
  ])];
  if (taskIds.length === 0) return NextResponse.json({ tasks: [] });

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("*")
    .in("id", taskIds);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const projectIds = [...new Set((tasks || []).map((task: { project_id: string }) => task.project_id).filter(Boolean))];
  const { data: projects, error: projectsError } = projectIds.length > 0
    ? await supabase.from("projects").select("id, name").in("id", projectIds)
    : { data: [], error: null };
  if (projectsError) return NextResponse.json({ error: projectsError.message }, { status: 500 });
  const projectMap = new Map((projects || []).map((project: { id: string; name: string }) => [project.id, project]));
  const enrichedTasks = (tasks || []).map((task: { project_id: string }) => ({
    ...task,
    projects: projectMap.get(task.project_id) || null,
  }));

  return NextResponse.json({ tasks: enrichedTasks });
}
