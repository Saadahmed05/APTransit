import { expect, test } from "@playwright/test";
import { login, uniqueEmail } from "./helpers";

// v3 Phase 1: login first, the bus opening animation, and the terms page.

test.describe("v3 Phase 1: shell", () => {
  test("a logged out visit to / goes to login and returns to / after login", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL((url) => url.pathname === "/login");
    expect(new URL(page.url()).searchParams.get("next")).toBe("/");
    await login(page, uniqueEmail("v3-shell"));
    expect(new URL(page.url()).pathname).toBe("/");
  });

  test("the splash is hidden from screen readers and never blocks input", async ({ page }) => {
    await page.goto("/login");
    const splash = page.getByTestId("bus-splash");
    await expect(splash).toHaveCount(1);
    await expect(splash).toHaveAttribute("aria-hidden", "true");
    await page.getByRole("textbox", { name: /email address/i }).fill(uniqueEmail("v3-splash"));
    const started = Date.now();
    const otp = page.waitForResponse(
      (res) => res.url().includes("/auth/otp/request") && res.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Send code" }).click();
    await otp;
    expect(Date.now() - started).toBeLessThan(500 + 5_000);
    await expect(page.getByRole("textbox", { name: /digit 1 of 6/i })).toBeVisible();
  });

  test("reduced motion hides the splash within a second", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/login");
    await expect
      .poll(
        () =>
          page
            .getByTestId("bus-splash")
            .evaluate((el) => getComputedStyle(el).visibility)
            .catch(() => "hidden"),
        { timeout: 1_500 },
      )
      .toBe("hidden");
  });

  test("/terms shows ten sections in English and in Telugu", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.locator("main h2")).toHaveCount(10);
    await page.locator('button[lang="te"]').click();
    await expect(page.locator('button[lang="te"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("main h2")).toHaveCount(10);
  });
});
