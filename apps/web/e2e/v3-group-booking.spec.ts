import { expect, test } from "@playwright/test";
import { login, pickTrip, uniqueEmail } from "./helpers";

test.describe("v3 group booking", () => {
  test.skip(
    process.env.E2E_PAYMENTS_FAKE !== "1",
    "needs the fake payment flag (E2E_PAYMENTS_FAKE=1)",
  );

  test("books two adults, a child and a senior by count, then exactly four seats (D-048)", async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, uniqueEmail("v3-group"));
    const { tripId, from, to, date } = await pickTrip(page);
    await page.goto(`/search?from=${from}&to=${to}&date=${date}`);
    await page.locator(`a[data-testid='trip-card'][href*='${tripId}']`).click();
    await page.getByRole("button", { name: /^book ticket/i }).click();

    // Counts, never names, ages or gender
    await page.getByRole("button", { name: "Add one Adult", exact: true }).click();
    await page.getByRole("button", { name: "Add one Child", exact: true }).click();
    await page.getByRole("button", { name: "Add one Senior citizen", exact: true }).click();
    await expect(page.getByLabel(/full name|^age/i)).toHaveCount(0);
    await page.getByRole("button", { name: /^choose 4 seats$/i }).click();
    await page.waitForURL(/\/seats$/);

    const available = page.getByRole("button", { name: /^Seat \d+, available$/ });
    await expect(available.first()).toBeVisible();
    expect(await available.count()).toBeGreaterThanOrEqual(4);
    for (let index = 0; index < 4; index++) await available.nth(index).click();
    // A fifth seat cannot be picked: exactly one seat per traveller
    await expect(page.getByText("4 of 4 seats picked")).toBeVisible();
    await page.getByRole("button", { name: /^continue$/i }).click();
    await page.waitForURL(/\/review\?booking=/);

    await expect(page.getByText("2 adults, 1 child, 1 senior", { exact: false })).toBeVisible();
    // Reserved long trip: every traveller keeps a seat on the review step
    await expect(page.getByText(/^Seat \d+$/)).toHaveCount(4);
    await expect(page.getByText("Senior citizen", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /^pay/i }).click();
    await page.waitForURL(/\/book\/done\//, { timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Ticket booked" })).toBeVisible();
  });
});
