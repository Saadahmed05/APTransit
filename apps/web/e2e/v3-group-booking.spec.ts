import { expect, test } from "@playwright/test";
import { login, pickTrip, uniqueEmail } from "./helpers";

test.describe("v3 group booking", () => {
  test.skip(
    process.env.E2E_PAYMENTS_FAKE !== "1",
    "needs the fake payment flag (E2E_PAYMENTS_FAKE=1)",
  );

  test("books two adults, a child and a senior with names, genders and seats", async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, uniqueEmail("v3-group"));
    const { tripId, from, to, date } = await pickTrip(page);
    await page.goto(`/search?from=${from}&to=${to}&date=${date}`);
    await page.locator(`a[data-testid='trip-card'][href*='${tripId}']`).click();
    await page.getByRole("button", { name: /^book ticket/i }).click();

    const available = page.getByRole("button", { name: /^Seat \d+, available$/ });
    await expect(available.first()).toBeVisible();
    expect(await available.count()).toBeGreaterThanOrEqual(4);
    for (let index = 0; index < 4; index++) await available.nth(index).click();
    await page.getByRole("button", { name: /^continue$/i }).click();

    const names = ["Adult One", "Adult Two", "Child One", "Senior One"];
    const ages = [35, 33, 8, 65];
    for (let index = 0; index < 4; index++) {
      await page.getByLabel(/full name/i).nth(index).fill(names[index]!);
      await page.getByLabel(/^age/i).nth(index).fill(String(ages[index]));
      await page.getByText("Female", { exact: true }).nth(index).click();
    }
    await page.getByRole("button", { name: /^continue$/i }).click();
    await page.waitForURL(/\/review\?booking=/);

    await expect(page.getByText("2 adults, 1 child, 1 senior", { exact: false })).toBeVisible();
    // reserved long trip: every passenger keeps a seat on the review step
    await expect(page.getByText(/Senior One, 65\s*Seat \d+/)).toBeVisible();
    await page.getByRole("button", { name: /^pay/i }).click();
    await page.waitForURL(/\/book\/done\//, { timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Ticket booked" })).toBeVisible();
  });
});
