import { expect, test } from "./fixtures";
import { tomorrowIst } from "./helpers";

/**
 * D-048: buses exist for the whole booking window (the API fills it without a worker), every class
 * runs every hour, and the empty state's next day button has a real label.
 */
test.describe("v4 trip window and hourly services", () => {
  test("Kurnool to Vijayawada has hourly Express and Super Luxury buses 20 days ahead", async ({ citizen: page }) => {
    const place = async (q: string) =>
      ((await (await page.request.get(`/api/v1/places/search?q=${encodeURIComponent(q)}&limit=1`)).json()) as { id: string }[])[0]!.id;
    const from = await place("Kurnool");
    const to = await place("Vijayawada");
    const date = tomorrowIst(20);
    await page.goto(`/search?from=${from}&to=${to}&date=${date}`);
    const cards = page.locator("a[data-testid='trip-card']");
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });
    expect(await cards.count()).toBeGreaterThanOrEqual(30);
    await expect(cards.filter({ hasText: "Super Luxury" }).first()).toBeVisible();
    await expect(cards.filter({ hasText: "Express" }).first()).toBeVisible();
  });

  test("the empty state offers the next day with a real label", async ({ citizen: page }) => {
    const place = async (q: string) =>
      ((await (await page.request.get(`/api/v1/places/search?q=${encodeURIComponent(q)}&limit=1`)).json()) as { id: string }[])[0]!.id;
    // No route joins these two, so every date is empty
    const from = await place("Simhachalam");
    const to = await place("Kurnool Bus Stand");
    const date = tomorrowIst(1);
    await page.goto(`/search?from=${from}&to=${to}&date=${date}`);
    await expect(page.getByTestId("search-empty")).toBeVisible({ timeout: 15_000 });
    const next = page.getByRole("button", { name: "Try the next day", exact: true });
    await expect(next).toBeVisible();
    await expect(page.getByText("{time}", { exact: false })).toHaveCount(0);
    await next.click();
    await expect(page).toHaveURL(new RegExp(`date=${tomorrowIst(2)}`));
  });
});
