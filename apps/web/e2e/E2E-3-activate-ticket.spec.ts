import {
  expect,
  openActivationWindow,
  openFirstTicket,
  resetActivationWindow,
  test,
} from "./fixtures";
import { bookAndPay } from "./helpers";

/**
 * E2E-3 (docs/14): activate a ticket inside its window; the QR shows and rotates.
 * Needs E2E_PAYMENTS_FAKE=1 and an API with APP_ENV=development (demo:window moves the trip).
 */
test.describe("E2E-3: Citizen activates a ticket", () => {
  test.skip(
    process.env.E2E_PAYMENTS_FAKE !== "1",
    "needs the fake payment flag (E2E_PAYMENTS_FAKE=1)",
  );

  test("activate inside the window, QR shows and rotates", async ({ citizen: page }) => {
    test.setTimeout(150_000);
    // Fake clock (time still flows): lets the test jump to the next 30 s step without waiting
    await page.clock.install();
    await bookAndPay(page);
    const code = await openFirstTicket(page);

    // Before the window: locked state, no QR
    await expect(page.getByText(/activate to show your qr code/i)).toBeVisible();
    openActivationWindow(code, 30);
    try {
      await page.reload();

      await page.getByRole("button", { name: /^activate ticket$/i }).click();
      const sheet = page.getByRole("dialog");
      await expect(sheet).toContainText(/after activating you cannot cancel or gift this ticket/i);
      await sheet.getByRole("button", { name: /^confirm activate$/i }).click();

      const qr = page.getByRole("img", { name: /ticket qr code/i });
      await expect(qr).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/colour of the day/i)).toBeVisible();
      const first = await qr.locator("path").getAttribute("d");

      await page.clock.fastForward(31_000);
      await expect
        .poll(async () => qr.locator("path").getAttribute("d"), { timeout: 10_000 })
        .not.toBe(first);
    } finally {
      resetActivationWindow(code);
    }
  });
});
