import { expect, type Page, test } from "@playwright/test";
import { login, tomorrowIst, uniqueEmail } from "./helpers";

// D-046, D-048: local buses have no seats. The traveller picks Adult, Child and Senior counts, the
// name comes from the account, and each category has its own fare. Needs a seeded database
// (Kurnool malls line KCM-01).

async function stopId(page: Page, q: string) {
  const res = await page.request.get(`/api/v1/places/search?q=${encodeURIComponent(q)}&limit=1`);
  return ((await res.json()) as { id: string }[])[0]!.id;
}

test.describe("D-046: seatless local booking", () => {
  test("map pickup and drop, counts instead of seats, adult child and senior fares", async ({ page }) => {
    test.setTimeout(150_000);
    await login(page, uniqueEmail("v3-local"));
    await page.goto("/");

    await page.getByText("Stops near you (list)", { exact: true }).click();
    await page.getByRole("button", { name: "From Kurnool Bus Stand", exact: true }).click();
    await page.getByRole("button", { name: "To Jyothi Mall", exact: true }).click();
    await expect(page.getByRole("combobox", { name: /^From$/ })).toHaveValue("Kurnool Bus Stand");
    await expect(page.getByRole("combobox", { name: /^To$/ })).toHaveValue("Jyothi Mall");

    const from = await stopId(page, "Kurnool Bus Stand");
    const to = await stopId(page, "Jyothi Mall");
    await page.goto(`/search?from=${from}&to=${to}&date=${tomorrowIst(1)}`);
    await page.locator("a[data-testid='trip-card']").first().click();
    await page.waitForURL(/\/bus\//);
    await page.getByRole("button", { name: /^book ticket/i }).click();

    // No seat map anywhere: the travellers step books a local trip directly
    const local = page.getByTestId("local-booking");
    await expect(local).toBeVisible();
    await expect(page.getByRole("button", { name: /^Seat \d+, available$/ })).toHaveCount(0);
    await expect(page.getByText("Local bus: no seat to pick. Get on and sit anywhere.")).toBeVisible();
    // No names: one adult is already counted, add a child and a senior
    await expect(page.getByLabel(/name/i)).toHaveCount(0);
    await page.getByRole("button", { name: "Add one Child", exact: true }).click();
    await page.getByRole("button", { name: "Add one Senior citizen", exact: true }).click();
    await expect(page.getByText("1 adult, 1 child, 1 senior")).toBeVisible();

    await page.getByRole("button", { name: "Continue to pay" }).click();
    await page.waitForURL(/\/review\?booking=/);

    // Review: categories, no names and no seats; the mix line shows the lower fares
    await expect(page.getByText("Adult", { exact: true })).toBeVisible();
    await expect(page.getByText("Child", { exact: true })).toBeVisible();
    await expect(page.getByText("Senior citizen", { exact: true })).toBeVisible();
    await expect(page.getByText(/^Seat \d+$/)).toHaveCount(0);
    await expect(page.getByText("1 adult, 1 child, 1 senior")).toBeVisible();

    await page.getByRole("button", { name: /^pay/i }).click();
    await page.waitForURL(/\/book\/done\//, { timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Ticket booked" })).toBeVisible({
      timeout: 15_000,
    });
  });
});
