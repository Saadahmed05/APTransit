import { expect, test } from "@playwright/test";
import { login } from "./helpers";

/**
 * Day 11 driver app smoke: the seeded driver with the seeded approved device key starts (or
 * continues) a trip, the phone's GPS (mocked here) reaches POST /tracking/ping, an issue is
 * reported, and the trip ends. Needs the dev stack (E2E_PAYMENTS_FAKE=1 marks it) and a trip of
 * driver.knl that is due within 60 min; it skips otherwise (for example at night).
 */
test.describe("Driver app", () => {
  test.skip(process.env.E2E_PAYMENTS_FAKE !== "1", "needs the dev stack (E2E_PAYMENTS_FAKE=1)");
  test.use({ geolocation: { latitude: 15.81, longitude: 78.045, accuracy: 10 }, permissions: ["geolocation"] });

  test("start, send GPS, report an issue, end the trip", async ({ page, context }) => {
    test.setTimeout(120_000);
    // The seeded approved device (prisma/seed.ts) stands in for a phone the depot already approved
    await context.addInitScript(() => window.localStorage.setItem("apt.driver.deviceKey", "sim_driver_key_kurnool_01"));
    await login(page, "driver.knl@aptransit.test", "/driver");

    await expect(page.getByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening)/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("This phone is approved")).toBeVisible();

    const continueTrip = page.getByRole("link", { name: /^continue trip$/i });
    const start = page.getByRole("button", { name: /^start trip$/i });
    await expect(continueTrip.or(start).or(page.getByText(/no trip assigned right now/i)).first()).toBeVisible();
    if (await continueTrip.isVisible()) {
      await continueTrip.click();
    } else {
      test.skip(!(await start.isVisible()) || (await start.isDisabled()), "no trip of driver.knl is due now");
      await start.click();
    }
    await page.waitForURL(/\/driver\/trip\/[a-z0-9]+$/, { timeout: 20_000 });
    const tripUrl = new URL(page.url()).pathname;

    await expect(page.getByRole("heading", { level: 1, name: "Trip active" })).toBeVisible();
    const ping = await page.waitForResponse((res) => res.url().includes("/tracking/ping") && res.request().method() === "POST", { timeout: 20_000 });
    expect(ping.status()).toBe(202);
    await expect(page.getByText("GPS: Active")).toBeVisible({ timeout: 10_000 });

    await page.getByRole("link", { name: /^report issue$/i }).click();
    await page.getByRole("button", { name: "Traffic" }).click();
    await page.getByLabel(/note/i).fill("Slow traffic near the bus stand");
    await page.getByRole("button", { name: /^send report$/i }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Depot alerted" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/^Report INC-[0-9A-Z]{6} was sent with your location\.$/)).toBeVisible();

    await page.goto(tripUrl);
    await page.getByRole("button", { name: /^end trip$/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Passengers will see the trip as completed.");
    await dialog.getByRole("button", { name: /^end trip$/i }).click();
    await page.waitForURL((url) => url.pathname === "/driver", { timeout: 20_000 });
  });
});
