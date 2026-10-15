import { expect, test } from "@playwright/test";
import { login, uniqueEmail } from "./helpers";

test.describe("v3 look and app shell", () => {
  test("home redirects to login and returns after sign in", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login\?next=%2F$/);

    await login(page, uniqueEmail("v3-shell"));
    await expect(page).toHaveURL(/\/$/);
  });

  test("the opening splash is hidden from assistive technology and never blocks login", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByTestId("bus-splash")).toHaveAttribute("aria-hidden", "true");
    await page.getByRole("button", { name: /send code/i }).click({ timeout: 500 });
  });

  test("reduced motion hides the opening splash within one second", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/login");
    await expect(page.getByTestId("bus-splash")).toHaveCSS("visibility", "hidden", {
      timeout: 1_000,
    });
  });

  test("terms has ten sections in English and Telugu", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.locator("h2")).toHaveCount(10);

    await page.locator('button[lang="te"]').click();
    await expect(page.locator("html")).toHaveAttribute("lang", "te");
    await expect(page.locator("h2")).toHaveCount(10);
  });
});
