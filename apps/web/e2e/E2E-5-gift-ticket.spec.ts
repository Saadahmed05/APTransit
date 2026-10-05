import { expect, openFirstTicket, test } from "./fixtures";
import { bookAndPay } from "./helpers";

/**
 * E2E-5 (docs/14): gift a ticket to citizen2; citizen2 sees it, the sender no longer does.
 * Needs E2E_PAYMENTS_FAKE=1 (fake payments, dev echo OTP, seeded citizen2@aptransit.test).
 */
test.describe("E2E-5: Citizen gifts a ticket", () => {
  test.skip(process.env.E2E_PAYMENTS_FAKE !== "1", "needs the fake payment flag (E2E_PAYMENTS_FAKE=1)");

  test("sender gifts, recipient sees it, sender loses it", async ({ citizen: sender, citizen2: recipient }) => {
    test.setTimeout(150_000);
    await bookAndPay(sender);
    await openFirstTicket(sender);
    const ticketUrl = new URL(sender.url()).pathname;

    // More actions, Gift ticket
    await sender.getByRole("button", { name: /more actions/i }).click();
    await sender.getByRole("menuitem", { name: /gift ticket/i }).click();
    await sender.waitForURL(/\/gift$/);
    await sender.getByRole("textbox", { name: /phone or email/i }).fill("citizen2@aptransit.test");
    await expect(sender.getByText("Email address", { exact: true })).toBeVisible();
    await sender.getByRole("button", { name: /^continue$/i }).click();
    const dialog = sender.getByRole("dialog");
    await expect(dialog).toContainText("You will lose access to this ticket.");
    await dialog.getByRole("button", { name: /^gift ticket$/i }).click();
    await sender.waitForURL((url) => url.pathname === "/tickets", { timeout: 20_000 });

    // The sender no longer has it
    await sender.goto(ticketUrl);
    await expect(sender.getByRole("heading", { level: 1, name: /ticket could not load/i })).toBeVisible();

    // The recipient sees it, with their own name on it
    await recipient.goto(ticketUrl);
    await expect(recipient.getByText("Citizen Lakshmi")).toBeVisible({ timeout: 15_000 });
    await expect(recipient.getByText(/not active/i).first()).toBeVisible();
  });
});
