import { createClient } from "@/lib/supabase/client";

export async function logActivity(params: {
  team_id?: string;
  project_id?: string;
  task_id?: string;
  user_id: string;
  action: string;
  detail?: string;
}) {
  try {
    const supabase = createClient();
    await supabase.from("activities").insert({
      team_id: params.team_id || null,
      project_id: params.project_id || null,
      task_id: params.task_id || null,
      user_id: params.user_id,
      action: params.action,
      detail: params.detail || null,
    });
  } catch {
    // Silently fail — activity logging should never break the app
  }
}
