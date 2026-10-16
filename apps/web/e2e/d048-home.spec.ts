import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// D-048 Phase 4: the map is the first thing on the home page, the search sheet sits over its lower
// edge, and a citizen can save a route and pick it again with one tap.

test.describe("D-048 map first home", () => {
  test("map above the search sheet, saved route round trip", async ({ page }) => {
    test.setTimeout(90_000);
    await login(page, "citizen2@aptransit.test");
    await page.goto("/");

    const pickup = page.getByTestId("map-field-from");
    const search = page.getByRole("button", { name: "Search buses", exact: true });
    await expect(pickup).toBeVisible();
    const pickupBox = (await pickup.boundingBox())!;
    const searchBox = (await search.boundingBox())!;
    expect(pickupBox.y, "Pickup floats on the map above the search sheet").toBeLessThan(searchBox.y);

    await page.getByText("Stops near you (list)", { exact: true }).click();
    await page.getByRole("button", { name: "From Kurnool Bus Stand", exact: true }).click();
    await page.getByRole("button", { name: "To Jyothi Mall", exact: true }).click();
    await page.getByRole("button", { name: "Save this route", exact: true }).click();
    await expect(page.getByRole("button", { name: "Remove from saved routes" })).toBeVisible();

    // A fresh page: the chip brings both boxes back
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    const chip = page.getByRole("button", { name: "Kurnool Bus Stand to Jyothi Mall" });
    await expect(chip).toBeVisible();
    await chip.click();
    await expect(page.getByRole("combobox", { name: /^From$/ })).toHaveValue("Kurnool Bus Stand");
    await expect(page.getByRole("combobox", { name: /^To$/ })).toHaveValue("Jyothi Mall");

    // Account lists it too, then remove it so the next run starts clean
    await page.goto("/account");
    await expect(page.getByRole("link", { name: "Kurnool Bus Stand to Jyothi Mall" })).toBeVisible();
    await page.getByRole("button", { name: "Remove saved route Kurnool Bus Stand to Jyothi Mall" }).click();
    await expect(page.getByText("No saved routes yet")).toBeVisible();
  });
});
