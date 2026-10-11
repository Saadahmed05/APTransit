import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/**
 * E2E-6 (docs/14, v2 P4): buy a pass from the catalog, activate it, the countdown is visible and the
 * QR shows. The Day pass (D-036) ends at midnight IST of the activation day. Needs
 * E2E_PAYMENTS_FAKE=1 (fake payments, dev echo OTP, seeded pass types).
 */
async function buyAndActivate(page: Page, buyButton: RegExp) {
  await page.goto("/passes/buy");
  await expect(page.getByText("Demo price").first()).toBeVisible();
  await page.getByRole("button", { name: buyButton }).click();
  await page.waitForURL((url) => url.pathname === "/passes", { timeout: 20_000 });

  await page.getByRole("button", { name: /^activate pass$/i }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toContainText(/valid from now until/i);
  await sheet.getByRole("button", { name: /^activate pass$/i }).click();
  await expect(page.getByRole("heading", { level: 2, name: /active pass/i }).first()).toBeVisible({ timeout: 15_000 });
}

test.describe("E2E-6: Citizen buys and activates a pass", () => {
  test.skip(process.env.E2E_PAYMENTS_FAKE !== "1", "needs the fake payment flag (E2E_PAYMENTS_FAKE=1)");

  test("Day pass: buy, activate, runs until midnight", async ({ citizen: page }) => {
    test.setTimeout(120_000);
    await buyAndActivate(page, /^buy day pass for ₹120$/i);
    // Under 24 hours the countdown shows hours, minutes and seconds
    await expect(page.getByText(/^\d{2} hours \d{2} minutes \d{2} seconds$/).first()).toBeVisible();
    await expect(page.getByRole("img", { name: /pass qr code/i }).first()).toBeVisible();
    await expect(page.getByText(/colour of the day/i).first()).toBeVisible();
  });

  test("weekly pass: buy, activate, 7 day countdown", async ({ citizen: page }) => {
    test.setTimeout(120_000);
    await buyAndActivate(page, /^buy weekly pass for ₹450$/i);
    await expect(page.getByText(/^6 days 23 hours \d{2} minutes$/)).toBeVisible();
  });
});
