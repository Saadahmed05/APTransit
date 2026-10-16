import { expect, test } from "@playwright/test";
import { login, uniqueEmail } from "./helpers";

// D-048 Phase 3: a new citizen completes the profile on /welcome before anything else, the account
// page shows what is verified, notification choices stick and other devices can be signed out.
// Needs the API with OTP_DEV_ECHO=1 and a seeded database.

test.describe("D-048 profile", () => {
  test.skip(process.env.E2E_PAYMENTS_FAKE !== "1", "needs the seeded development stack");

  test("a new citizen is sent to /welcome, completes it, and lands where they were going", async ({ page }) => {
    test.setTimeout(90_000);
    // login() completes /welcome and waits for `next`
    await login(page, uniqueEmail("d048-new"), "/tickets");
    expect(new URL(page.url()).pathname).toBe("/tickets");

    // Another page does not send them back
    await page.goto("/account");
    await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
    await expect(page.getByTestId("contact-email")).toContainText("Verified");
    await expect(page.getByTestId("contact-phone")).toContainText("Verified");
    await expect(page.getByTestId("contact-phone")).not.toContainText("Not verified");
    await expect(page.getByLabel(/^name$/i)).toHaveValue("E2E Traveller");
  });

  test("a signed in citizen cannot skip /welcome by typing a page address", async ({ browser }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext();
    const page = await context.newPage();
    // Sign in only, stop at /welcome
    const email = uniqueEmail("d048-skip");
    await page.goto("/login?next=%2Fpasses");
    await page.getByRole("textbox", { name: /email address/i }).fill(email);
    const sent = page.waitForResponse((res) => res.url().includes("/auth/otp/request") && res.request().method() === "POST");
    await page.keyboard.press("Enter");
    const { devCode } = (await (await sent).json()) as { devCode?: string };
    await page.getByRole("textbox", { name: /digit 1 of 6/i }).click();
    await page.keyboard.type(devCode!);
    await page.waitForURL((url) => url.pathname === "/welcome");
    expect(new URL(page.url()).searchParams.get("next")).toBe("/passes");
    await page.goto("/account");
    await page.waitForURL((url) => url.pathname === "/welcome");
    await expect(page.getByRole("heading", { level: 1, name: /welcome/i })).toBeVisible();
    await context.close();
  });

  test("notification choices are kept and devices are listed", async ({ page }) => {
    test.setTimeout(90_000);
    await login(page, "citizen@aptransit.test", "/account");
    const trips = page.getByRole("switch", { name: /trip changes and delays/i });
    await expect(trips).toBeChecked();
    await trips.click();
    await expect(trips).not.toBeChecked();
    await page.reload();
    await expect(page.getByRole("switch", { name: /trip changes and delays/i })).not.toBeChecked();
    await page.getByRole("switch", { name: /trip changes and delays/i }).click(); // back to the default
    await expect(page.getByText("This device")).toBeVisible();
  });
});
