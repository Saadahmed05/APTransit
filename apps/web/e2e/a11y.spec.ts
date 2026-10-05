import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, openFirstTicket, test } from "./fixtures";
import { bookAndPay, tomorrowIst } from "./helpers";

/** docs/14 Accessibility: zero serious or critical axe violations on the main citizen pages. */
async function expectNoSeriousViolations(page: Page, name: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const serious = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(serious, `${name} has serious accessibility violations`).toEqual([]);
}

test.describe("Accessibility (axe)", () => {
  test("home, search and bus details", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoSeriousViolations(page, "/");

    const place = async (q: string) => ((await (await page.request.get(`/api/v1/places/search?q=${q}&limit=1`)).json()) as { id: string }[])[0]!.id;
    await page.goto(`/search?from=${await place("Kurnool")}&to=${await place("Vijayawada")}&date=${tomorrowIst()}`);
    await expect(page.locator("a[data-testid='trip-card']").first()).toBeVisible({ timeout: 15_000 });
    await expectNoSeriousViolations(page, "/search");

    await page.locator("a[data-testid='trip-card']").first().click();
    await expect(page.getByTestId("bus-detail-content")).toBeVisible({ timeout: 15_000 });
    await expectNoSeriousViolations(page, "/bus/[id]");
  });

  test("ticket and passes", async ({ citizen: page }) => {
    test.skip(process.env.E2E_PAYMENTS_FAKE !== "1", "needs the fake payment flag (E2E_PAYMENTS_FAKE=1)");
    test.setTimeout(120_000);
    await bookAndPay(page);
    await openFirstTicket(page);
    await expect(page.getByText(/activate to show your qr code/i)).toBeVisible();
    await expectNoSeriousViolations(page, "/tickets/[id]");

    await page.goto("/passes");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoSeriousViolations(page, "/passes");
  });
});
