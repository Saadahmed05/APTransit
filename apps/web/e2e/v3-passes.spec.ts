import { expect, test } from "./fixtures";

test.describe("v3 zone passes and child cards", () => {
  test.skip(
    process.env.E2E_PAYMENTS_FAKE !== "1",
    "needs the fake payment flag (E2E_PAYMENTS_FAKE=1)",
  );

  test("buys a Kurnool zone pass and a weekly child card", async ({ citizen: page }) => {
    test.setTimeout(120_000);
    await page.goto("/passes/buy");
    await page.getByLabel("District (zone)").selectOption({ label: "Kurnool" });
    await page.getByRole("button", { name: /^buy zone day pass for/i }).click();
    await page.waitForURL((url) => url.pathname === "/passes", { timeout: 20_000 });

    await page.goto("/passes/buy");
    await page.getByText("This pass is for my child", { exact: true }).click();
    await page.getByLabel("Name of the child").fill("Anu");
    await page.getByLabel("Age", { exact: true }).fill("9");
    await page.getByRole("button", { name: /^buy weekly pass for/i }).click();
    await page.waitForURL((url) => url.pathname === "/passes", { timeout: 20_000 });

    await expect(page.getByText("Child card for Anu, age 9")).toBeVisible();
  });
});
