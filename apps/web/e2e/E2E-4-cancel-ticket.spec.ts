import { expect, openFirstTicket, test } from "./fixtures";
import { bookAndPay } from "./helpers";

/**
 * E2E-4 (docs/14): cancel a booked ticket; the refund on the ticket matches the quote.
 * Needs E2E_PAYMENTS_FAKE=1.
 */
test.describe("E2E-4: Citizen cancels a ticket", () => {
  test.skip(process.env.E2E_PAYMENTS_FAKE !== "1", "needs the fake payment flag (E2E_PAYMENTS_FAKE=1)");

  test("refund amount matches the quote", async ({ citizen: page }) => {
    test.setTimeout(120_000);
    await bookAndPay(page);
    await openFirstTicket(page);

    await page.getByRole("button", { name: /more actions/i }).click();
    await page.getByRole("menuitem", { name: /cancel ticket/i }).click();
    await page.waitForURL(/\/cancel$/);

    const quote = await page.getByText(/^You get ₹[\d,]+ back$/).textContent();
    const amount = /₹[\d,]+/.exec(quote ?? "")?.[0];
    expect(amount).toBeTruthy();

    await page.getByRole("button", { name: /^cancel ticket$/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(`You get ${amount} back`);
    await dialog.getByRole("button", { name: /^cancel ticket$/i }).click();

    await page.waitForURL(/\/tickets\/[a-z0-9]+$/, { timeout: 20_000 });
    await expect(page.getByText(/this ticket is cancelled/i)).toBeVisible();
    await expect(page.getByText(new RegExp(`(Refund in progress: ${amount}|${amount} refunded)`))).toBeVisible();
  });
});
