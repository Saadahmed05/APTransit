import { expect, test } from "@playwright/test";
import { pickTrip } from "./helpers";

/**
 * E2E-2 (docs/14): login with OTP (dev echo), book a seat, pay with the fake payment flag, see the
 * ticket in My tickets.
 * Needs: API with OTP_DEV_ECHO=1 and PAYMENTS_FAKE=1, web built with NEXT_PUBLIC_PAYMENTS_FAKE=1,
 * a seeded database. Set E2E_PAYMENTS_FAKE=1 to run it (CI does).
 */

test.describe("E2E-2: Citizen books and pays", () => {
  test.skip(process.env.E2E_PAYMENTS_FAKE !== "1", "needs the fake payment flag (E2E_PAYMENTS_FAKE=1)");

  test("login, book a seat, pay, see the ticket", async ({ page }) => {
    test.setTimeout(120_000);
    const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.test`;

    // 1. Login with the dev echoed code
    await page.goto("/login?next=%2F");
    await page.getByRole("textbox", { name: /email address/i }).fill(email);
    const otpResponse = page.waitForResponse((res) => res.url().includes("/auth/otp/request") && res.request().method() === "POST");
    await page.keyboard.press("Enter");
    const { devCode } = (await (await otpResponse).json()) as { devCode?: string };
    expect(devCode, "API must run with OTP_DEV_ECHO=1").toMatch(/^\d{6}$/);
    await page.getByRole("textbox", { name: /digit 1 of 6/i }).click();
    await page.keyboard.type(devCode!);
    await page.waitForURL((url) => url.pathname === "/", { timeout: 20_000 });

    // 2. Search Kurnool to Vijayawada for tomorrow (E2E-1 covers the home form itself)
    const { tripId, from, to, date } = await pickTrip(page);
    await page.goto(`/search?from=${from}&to=${to}&date=${date}`);
    await page.locator(`a[data-testid='trip-card'][href*='${tripId}']`).click();
    await page.waitForURL(/\/bus\//);

    // 3. Book: first free seat, passenger details, review
    await page.getByRole("button", { name: /book ticket/i }).click();
    await page.waitForURL(/\/book\/[^/]+\?/);
    // A random free seat: the desktop and phone projects run at the same time
    const free = page.getByRole("button", { name: /^Seat \d+, available$/ });
    await expect(free.first()).toBeVisible();
    await free.nth(Math.floor(Math.random() * (await free.count()))).click();
    await page.getByRole("button", { name: /^continue$/i }).click();
    await page.waitForURL(/\/details$/);
    await page.getByLabel(/full name/i).first().fill("E2E Passenger");
    await page.getByLabel(/^age/i).first().fill("30");
    await page.getByText("Female", { exact: true }).first().click();
    await page.getByRole("button", { name: /^continue$/i }).click();
    await page.waitForURL(/\/review\?booking=/);
    await expect(page.getByRole("timer")).toBeVisible();

    // 4. Pay (fake flag: no popup) and land on the confirmation
    await page.getByRole("button", { name: /^pay/i }).click();
    await page.waitForURL(/\/book\/done\//, { timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Ticket booked" })).toBeVisible({ timeout: 15_000 });

    // 5. My tickets shows it
    await page.getByRole("link", { name: /view ticket/i }).click();
    await page.waitForURL(/\/tickets/);
    await expect(page.getByRole("link", { name: /not active/i }).first()).toBeVisible();
  });
});
