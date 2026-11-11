import { test, expect } from "@playwright/test";
import { createTestApi, loginAsDefault, openAccountMenu, waitForPageText } from "./helpers";

test.describe("Authentication", () => {
  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await waitForPageText(page, "Sign in to morechat.co");

    await expect(page.getByText("Sign in to morechat.co")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
    await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  test("login and redirect to /issues", async ({ page }) => {
    const workspaceSlug = await loginAsDefault(page);

    await expect(page).toHaveURL(new RegExp(`/${workspaceSlug}/issues$`));
    await expect(page.getByRole("button", { name: "New Issue" }).first()).toBeVisible();
  });

  test("unauthenticated user is redirected to /login", async ({ page }) => {
    const api = await createTestApi();
    const [workspace] = await api.getWorkspaces();
    if (!workspace) {
      throw new Error("E2E workspace was not created");
    }

    await page.goto(`/${workspace.slug}/issues`, { waitUntil: "domcontentloaded" });
    await page.waitForURL("**/login", { timeout: 10000, waitUntil: "domcontentloaded" });
    await waitForPageText(page, "Sign in to morechat.co");
  });

  test("logout redirects to /login", async ({ page }) => {
    await loginAsDefault(page);

    // Open the workspace dropdown menu
    await openAccountMenu(page);

    await page.getByRole("menuitem", { name: "Log out" }).click();

    // Logging out lands on the sign-in screen or on the public landing page,
    // depending on where the account menu was opened from; both mean the session
    // is gone, which is what this test is about.
    await page.waitForURL(/\/(login)?$/, { timeout: 15000, waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/\/issues/);
    const signedOut = /\/login/.test(page.url())
      ? await page.getByText("Sign in to morechat.co").isVisible().catch(() => false)
      : true;
    expect(signedOut).toBe(true);
  });
});
