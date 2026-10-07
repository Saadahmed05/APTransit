import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { bookAndPay, pickTrip } from "./helpers";

// docs/14 E2E-12: switch to Telugu on home, search and a ticket; no missing keys, no overflow.
// next-intl renders a missing message as its key path (for example "home.title"), so any line
// that looks like a key path is a missing translation.

const KEY_PATH = /^[a-z][A-Za-z]+(\.[A-Za-z0-9_]+)+$/;

async function checkTelugu(page: Page, label: string) {
  await expect(page.locator("html")).toHaveAttribute("lang", "te");
  const lines = (await page.locator("body").innerText()).split("\n").map((l) => l.trim());
  const missing = lines.filter((l) => KEY_PATH.test(l));
  expect(missing, `${label}: untranslated keys`).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label}: horizontal scroll`).toBeLessThanOrEqual(0);
  // Telugu script is on the page (not English left behind everywhere)
  expect(lines.join(" "), `${label}: Telugu text`).toMatch(/[ఀ-౿]/);
}

test("E2E-12 Telugu: home, search, ticket and feedback in Telugu without missing keys or overflow", async ({ citizen: page }) => {
  test.setTimeout(150_000);
  await page.goto("/");
  await page.locator('button[lang="te"]').click();
  await expect(page.locator('button[lang="te"]')).toHaveAttribute("aria-pressed", "true");
  await checkTelugu(page, "home");

  const trip = await pickTrip(page);
  await page.goto(`/search?from=${trip.from}&to=${trip.to}&date=${trip.date}`);
  await expect(page.getByTestId("trip-card").first()).toBeVisible({ timeout: 20_000 });
  await checkTelugu(page, "search");

  await bookAndPay(page);
  await page.goto("/tickets");
  await page.locator('a[href^="/tickets/"]').first().click();
  await expect(page).toHaveURL(/\/tickets\/[a-z0-9]+$/);
  await page.waitForLoadState("networkidle");
  await checkTelugu(page, "ticket");

  await page.goto("/feedback");
  await checkTelugu(page, "feedback");

  // Back to English for the other journeys of this worker
  await page.locator('button[lang="en"]').click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});
