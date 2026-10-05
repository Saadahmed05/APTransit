import { expect, test } from "./fixtures";

/**
 * E2E-6 (docs/14): buy a weekly pass, activate it, the countdown is visible and the QR shows.
 * Needs E2E_PAYMENTS_FAKE=1 (fake payments, dev echo OTP, seeded pass types).
 */
test.describe("E2E-6: Citizen buys and activates a weekly pass", () => {
  test.skip(process.env.E2E_PAYMENTS_FAKE !== "1", "needs the fake payment flag (E2E_PAYMENTS_FAKE=1)");

  test("buy, activate, see the countdown", async ({ citizen: page }) => {
    test.setTimeout(120_000);
    await page.goto("/passes/buy");

    await page.getByRole("button", { name: /weekly pass/i }).click();
    await page.getByRole("button", { name: /^pay ₹450$/i }).click();
    await page.waitForURL((url) => url.pathname === "/passes", { timeout: 20_000 });

    await page.getByRole("button", { name: /^activate pass$/i }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toContainText(/valid from now until/i);
    await sheet.getByRole("button", { name: /^activate pass$/i }).click();

    await expect(page.getByRole("heading", { level: 2, name: /active pass/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/^6 days 23 hours \d{2} minutes$/)).toBeVisible();
    await expect(page.getByRole("img", { name: /pass qr code/i })).toBeVisible();
    await expect(page.getByText(/colour of the day/i)).toBeVisible();
  });
});
