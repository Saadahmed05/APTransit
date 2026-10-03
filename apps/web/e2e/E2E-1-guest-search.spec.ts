import { expect, test } from "@playwright/test";

/**
 * E2E-1: Guest search journey
 * Journey: home, search Kurnool to Vijayawada for tomorrow, see results, open bus details.
 * Requires: dev server running on port 3000 (or BASE_URL).
 * Does NOT require login.
 */
test.describe("E2E-1: Guest search journey", () => {
  test("home to search to bus details", async ({ page }) => {
    // 1. Land on the home page
    await page.goto("/");
    await expect(page).toHaveTitle(/AP TransitOS/);

    // 2. Wait for the search form to mount (it defers until hydrated)
    const fromInput = page.getByRole("combobox", { name: /from/i });
    await expect(fromInput).toBeVisible({ timeout: 10_000 });

    // 3. Type Kurnool in the From field and pick the first suggestion
    await fromInput.click();
    await fromInput.fill("Kurnool");
    const fromOption = page.getByRole("option", { name: /Kurnool/i }).first();
    await expect(fromOption).toBeVisible({ timeout: 5_000 });
    await fromOption.click();

    // 4. Type Vijayawada in the To field and pick the first suggestion
    const toInput = page.getByRole("combobox", { name: /to/i });
    await toInput.click();
    await toInput.fill("Vijayawada");
    const toOption = page.getByRole("option", { name: /Vijayawada/i }).first();
    await expect(toOption).toBeVisible({ timeout: 5_000 });
    await toOption.click();

    // 5. Pick Tomorrow chip and submit
    const tomorrowChip = page.getByRole("button", { name: /tomorrow/i });
    await tomorrowChip.click();

    const searchBtn = page.getByRole("button", { name: /search/i });
    await searchBtn.click();

    // 6. Now on /search: wait for results or empty state (not a raw loading spinner forever)
    await page.waitForURL(/\/search/, { timeout: 10_000 });

    // Sticky summary bar must be visible
    const summaryBar = page.getByTestId("search-summary-bar");
    await expect(summaryBar).toBeVisible({ timeout: 10_000 });

    const tripCard = page.locator("a[data-testid='trip-card']");
    const emptyState = page.getByTestId("search-empty");
    await expect(tripCard.first().or(emptyState)).toBeVisible({ timeout: 15_000 });

    if (process.env.E2E_REQUIRE_RESULTS === "1") {
      await expect(tripCard.first()).toBeVisible();
    }

    // The summary bar shows the picked place names, not ids
    await expect(summaryBar).toContainText(/Kurnool/i);
    await expect(summaryBar).toContainText(/Vijayawada/i);

    // The 06:30 Express is a morning bus: set the Morning filter before opening it
    await page.getByRole("button", { name: /morning/i }).click();
    await page.waitForURL(/timeBand=morning/, { timeout: 5_000 });

    const cardCount = await tripCard.count();
    if (cardCount > 0) {
      const firstCard = tripCard.first();
      const href = await firstCard.getAttribute("href");
      expect(href).toMatch(/\/bus\//);
      await firstCard.click();

      await page.waitForURL(/\/bus\//, { timeout: 10_000 });

      const busContent = page.getByTestId("bus-detail-content");
      await expect(busContent).toBeVisible({ timeout: 10_000 });

      const bookBtn = page.getByRole("link", { name: /book ticket/i }).or(
        page.getByRole("button", { name: /book ticket/i }),
      );
      await expect(bookBtn).toBeVisible({ timeout: 5_000 });

      await page.goBack();
      await page.waitForURL(/\/search/, { timeout: 5_000 });
      const urlBack = new URL(page.url());
      expect(urlBack.searchParams.get("from")).toBeTruthy();
      expect(urlBack.searchParams.get("to")).toBeTruthy();
      expect(urlBack.searchParams.get("timeBand")).toBe("morning");
      await expect(page.getByRole("button", { name: /morning/i })).toHaveAttribute("aria-pressed", "true");
    }
  });

  test("filter chips persist in the URL", async ({ page }) => {
    // Navigate directly to search with params (simulates coming from home)
    await page.goto("/search?from=stopknl0000&to=stopvja0000");
    await page.waitForURL(/\/search/, { timeout: 10_000 });

    // Click the Morning filter chip
    const morningChip = page.getByRole("button", { name: /morning/i });
    await expect(morningChip).toBeVisible({ timeout: 5_000 });
    await morningChip.click();

    // URL should now contain timeBand=morning
    await page.waitForFunction(() =>
      new URL(window.location.href).searchParams.get("timeBand") === "morning",
    );
    expect(new URL(page.url()).searchParams.get("timeBand")).toBe("morning");
  });
});
