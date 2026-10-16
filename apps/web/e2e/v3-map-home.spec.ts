import { expect, test } from "@playwright/test";
import { login, tomorrowIst, uniqueEmail } from "./helpers";

const VILLAGE_SERVICE = /Pallevelugu|Ultra Pallevelugu|City Ordinary|Metro Express/i;

test.describe("v3 Phase 3: map home and search", () => {
  test("selects stops, filters village services, locates a stop and shows next day", async ({
    context,
    page,
  }) => {
    test.setTimeout(120_000);
    await login(page, uniqueEmail("v3-map"));
    await page.goto("/");

    await page.getByText("Stops near you (list)", { exact: true }).click();
    await page.getByRole("button", { name: "From Kurnool Bus Stand", exact: true }).click();
    await page.getByRole("button", { name: "To Orvakal", exact: true }).click();

    await expect(page.getByRole("combobox", { name: /^From$/ })).toHaveValue("Kurnool Bus Stand");
    await expect(page.getByRole("combobox", { name: /^To$/ })).toHaveValue("Orvakal");

    const kurnool = await placeId(page, "Kurnool");
    const orvakal = await placeId(page, "Orvakal");
    await page.getByRole("button", { name: "Search buses", exact: true }).click();
    await page.waitForURL((url) => {
      return (
        url.pathname === "/search" &&
        url.searchParams.get("from") === kurnool &&
        url.searchParams.get("to") === orvakal
      );
    });

    const tripCards = page.locator("a[data-testid='trip-card']");
    await expect(tripCards.first()).toBeVisible({ timeout: 15_000 });
    const tripCount = await tripCards.count();
    expect(tripCount).toBeGreaterThan(0);
    for (let index = 0; index < tripCount; index += 1) {
      await expect(tripCards.nth(index)).toContainText(VILLAGE_SERVICE);
    }

    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 15.67, longitude: 78.11 });
    await page.goto("/");
    await page.getByRole("button", { name: "Use my location", exact: true }).click();
    await expect(page.getByRole("combobox", { name: /^From$/ })).toHaveValue("Orvakal", {
      timeout: 10_000,
    });

    // Headless Chromium leaves a prompt pending forever, so answer "denied" the way a blocked browser does
    await page.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (_ok, fail) =>
        fail?.({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
    });
    await page.reload();
    await page.getByRole("button", { name: "Use my location", exact: true }).click();
    await expect(
      page.getByRole("alert").filter({
        hasText: "We could not find your location. Pick a stop on the map or type a place.",
      }),
    ).toBeVisible({ timeout: 15_000 });

    const vijayawada = await placeId(page, "Vijayawada");
    const dwaraka = await placeId(page, "Dwaraka");
    await page.goto(`/search?from=${vijayawada}&to=${dwaraka}&date=${tomorrowIst()}`);
    const overnight = page.locator("a[data-testid='trip-card']").filter({ hasText: "09:00 pm" });
    await expect(overnight).toHaveCount(1, { timeout: 15_000 });
    await expect(overnight).toContainText("next day");
  });
});

async function placeId(page: Parameters<typeof login>[0], query: string): Promise<string> {
  const response = await page.request.get(
    `/api/v1/places/search?q=${encodeURIComponent(query)}&limit=1`,
  );
  expect(response.ok()).toBe(true);
  const places = (await response.json()) as { id: string }[];
  expect(places.length).toBeGreaterThan(0);
  return places[0]!.id;
}
