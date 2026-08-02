import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const E2E_EMAIL = "e2e-tests@wahwedoin.test";
const E2E_PASSWORD = "E2e-Pass-2026!";
const E2E_DISPLAY_NAME = "E2E Test User";
const ORG_NAME = "E2E Test Org";
const ORG_SLUG = "e2e-test-org";
const TEAM_NAME = "E2E Test Team";
const TEAM_SLUG = "e2e-test-team";
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

  // Ensure the organization exists (the app's /manage page and /teams redirect
  // both need the user to belong to an organization).
  const { data: orgs } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", ORG_SLUG)
    .limit(1);
  let orgId = orgs?.[0]?.id ?? null;
  if (!orgId) {
    const { data: org, error } = await admin
      .from("organizations")
      .insert({ name: ORG_NAME, slug: ORG_SLUG })
      .select("id")
      .single();
    if (error) throw new Error(`Failed to create e2e org: ${error.message}`);
    orgId = org.id;
  }

  await admin.from("org_members").upsert(
    { org_id: orgId, user_id: userId, role: "owner" },
    { onConflict: "org_id,user_id" },
  );

  // Ensure the team exists and belongs to that organization.
  const { data: teams } = await admin
    .from("teams")
    .select("id")
    .eq("name", TEAM_NAME)
    .limit(1);
  let teamId = teams?.[0]?.id ?? null;
  if (!teamId) {
    const { data: team, error } = await admin
      .from("teams")
      .insert({ name: TEAM_NAME, slug: TEAM_SLUG, org_id: orgId })
      .select("id")
      .single();
    if (error) throw new Error(`Failed to create e2e team: ${error.message}`);
    teamId = team.id;
  } else {
    const { error } = await admin.from("teams").update({ org_id: orgId }).eq("id", teamId);
    if (error) throw new Error(`Failed to attach e2e team to org: ${error.message}`);
  }

  const { error: membershipError } = await admin.from("team_members").upsert(
    { team_id: teamId, user_id: userId, role: "owner", joined_at: new Date().toISOString() },
    { onConflict: "team_id,user_id" },
  );
  if (membershipError) throw new Error(`Failed to add e2e team member: ${membershipError.message}`);

  const { error: profileError } = await admin.from("user_profiles").upsert(
    {
      user_id: userId,
      display_name: E2E_DISPLAY_NAME,
      timezone: "America/Barbados",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (profileError) throw new Error(`Failed to seed e2e user profile: ${profileError.message}`);

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
