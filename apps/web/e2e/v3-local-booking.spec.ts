import { expect, type Page, test } from "@playwright/test";
import { login, tomorrowIst, uniqueEmail } from "./helpers";

// D-045: local buses have no seats. The traveller gives ages, the name comes from the account, and
// the fare is adult, child or senior by age. Needs a seeded database (Kurnool malls line KCM-01).

async function stopId(page: Page, q: string) {
  const res = await page.request.get(`/api/v1/places/search?q=${encodeURIComponent(q)}&limit=1`);
  return ((await res.json()) as { id: string }[])[0]!.id;
}

test.describe("D-045: seatless local booking", () => {
  test("map pickup and drop, ages instead of seats, adult child and senior fares", async ({ page }) => {
    test.setTimeout(150_000);
    await login(page, uniqueEmail("v3-local"));
    await page.goto("/");

    // Rapido style: Pickup is active first, a stop sets it and Drop becomes active
    await expect(page.getByTestId("map-field-from")).toHaveAttribute("aria-pressed", "true");
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

    // No seat map: the local booking screen
    const local = page.getByTestId("local-booking");
    await expect(local).toBeVisible();
    await expect(page.getByRole("button", { name: /^Seat \d+, available$/ })).toHaveCount(0);

    // The name comes from the account; a new OTP account has none, so it is asked once
    await page.getByLabel("Your name").fill("Local Traveller");
    await page.getByLabel("Age of traveller 1").fill("35");
    await page.getByRole("button", { name: "Add another traveller" }).click();
    await page.getByLabel("Age of traveller 2").fill("8");
    await page.getByRole("button", { name: "Add another traveller" }).click();
    await page.getByLabel("Age of traveller 3").fill("64");
    await expect(local.getByText("Adult", { exact: false }).first()).toBeVisible();
    await expect(local.getByText("Child", { exact: false }).first()).toBeVisible();
    await expect(local.getByText("Senior citizen", { exact: false }).first()).toBeVisible();

    await page.getByRole("button", { name: "Continue to pay" }).click();
    await page.waitForURL(/\/review\?booking=/);

    // Review: ages and categories, no names and no seats; the mix line shows the lower fares
    await expect(page.getByText("Adult, age 35")).toBeVisible();
    await expect(page.getByText("Child, age 8")).toBeVisible();
    await expect(page.getByText("Senior citizen, age 64")).toBeVisible();
    await expect(page.getByText(/^Seat \d+$/)).toHaveCount(0);
    await expect(page.getByText("1 adult, 1 child, 1 senior")).toBeVisible();

    await page.getByRole("button", { name: /^pay/i }).click();
    await page.waitForURL(/\/book\/done\//, { timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Ticket booked" })).toBeVisible({
      timeout: 15_000,
    });
  });
});
