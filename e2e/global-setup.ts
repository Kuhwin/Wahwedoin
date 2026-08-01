import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const E2E_EMAIL = "e2e-tests@wahwedoin.test";
const E2E_PASSWORD = "E2e-Pass-2026!";
const E2E_DISPLAY_NAME = "E2E Test User";
const TEAM_NAME = "E2E Test Team";
const PROJECT_NAME = "E2E Test Project";

// Next.js loads .env.local for build/start; mirror that so the setup talks to
// the same Supabase project the built app uses.
function loadEnv(file: string) {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) return;
  const raw = fs.readFileSync(full, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

export default async function globalSetup() {
  loadEnv(".env.local");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey || serviceKey.includes("PASTE_") || serviceKey.length < 100) {
    process.env.E2E_AUTH_AVAILABLE = "false";
    console.warn(
      "[e2e] SUPABASE_SERVICE_ROLE_KEY is missing or a placeholder in .env.local — " +
        "authenticated tests will be skipped. Add the real key to enable them.",
    );
    return;
  }
  process.env.E2E_AUTH_AVAILABLE = "true";

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Ensure the test user exists and is confirmed so password login works.
  let userId: string;
  const { data: existing } = await admin.auth.admin.listUsers();
  const found = existing?.users.find((u) => u.email === E2E_EMAIL);
  if (found) {
    userId = found.id;
  } else {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: E2E_EMAIL,
      password: E2E_PASSWORD,
      email_confirm: true,
    });
    if (error) throw new Error(`Failed to create e2e user: ${error.message}`);
    userId = created.user.id;
  }

  // Ensure the team exists.
  const { data: teams } = await admin
    .from("teams")
    .select("id")
    .eq("name", TEAM_NAME)
    .limit(1);
  let teamId = teams?.[0]?.id ?? null;
  if (!teamId) {
    const { data: team, error } = await admin
      .from("teams")
      .insert({ name: TEAM_NAME })
      .select("id")
      .single();
    if (error) throw new Error(`Failed to create e2e team: ${error.message}`);
    teamId = team.id;
  }

  await admin.from("team_members").upsert(
    { team_id: teamId, user_id: userId, role: "owner", joined_at: new Date().toISOString() },
    { onConflict: "team_id,user_id" },
  );

  await admin.from("user_profiles").upsert(
    {
      user_id: userId,
      display_name: E2E_DISPLAY_NAME,
      user_email: E2E_EMAIL,
      timezone: "America/Barbados",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  // Ensure the project exists in that team.
  const { data: projects } = await admin
    .from("projects")
    .select("id")
    .eq("name", PROJECT_NAME)
    .eq("team_id", teamId)
    .limit(1);

  if (!projects?.[0]) {
    const { error } = await admin.from("projects").insert({
      name: PROJECT_NAME,
      description: "Seeded by the e2e global setup",
      team_id: teamId,
      color: "#6366f1",
      created_by: userId,
    });
    if (error) throw new Error(`Failed to create e2e project: ${error.message}`);
  }
}
