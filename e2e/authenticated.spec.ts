import { test, expect, type Page } from "@playwright/test";

const E2E_EMAIL = "e2e-tests@wahwedoin.test";
const E2E_PASSWORD = "E2e-Pass-2026!";

async function login(page: Page) {
  await page.goto("/auth/login");
  await page.locator('input[type="email"]').fill(E2E_EMAIL);
  await page.locator('input[type="password"]').fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth/login"), { timeout: 20000 });
}

test.describe("authenticated pages", () => {
  test.skip(
    process.env.E2E_AUTH_AVAILABLE !== "true",
    "Authenticated tests need a real SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );

  test("dashboard loads", async ({ page }) => {
    await login(page);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 15000 });
  });

  test("projects page lists the seeded project", async ({ page }) => {
    await login(page);
    await page.goto("/projects");
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("E2E Test Project")).toBeVisible({ timeout: 15000 });
  });

  test("teams page redirects to manage", async ({ page }) => {
    await login(page);
    await page.goto("/teams");
    await expect(page).toHaveURL(/\/manage/, { timeout: 15000 });
    await expect(page.getByRole("heading", { name: "Manage" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: "E2E Test Org" })).toBeVisible({ timeout: 15000 });
  });

  test("settings page loads", async ({ page }) => {
    await login(page);
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({ timeout: 15000 });
  });
});
