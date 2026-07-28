import { test, expect } from "@playwright/test";

test("login page loads", async ({ page }) => {
  await page.goto("/auth/login");
  await expect(page.getByText("Welcome back")).toBeVisible();
  await expect(page.getByText("Continue with Google")).toBeVisible();
  await expect(page.getByText("Sign in with magic link")).toBeVisible();
});

test("login page has link to signup", async ({ page }) => {
  await page.goto("/auth/login");
  await expect(page.getByText("Don't have an account?")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign up" })).toBeVisible();
});

test("signup page loads", async ({ page }) => {
  await page.goto("/auth/signup");
  await expect(page.getByText("Create account")).toBeVisible();
  await expect(page.getByText("Continue with Google")).toBeVisible();
});

test("redirects unauthenticated users to login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/auth\/login/);
});
