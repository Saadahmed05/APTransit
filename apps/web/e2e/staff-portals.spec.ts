import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// The sign in page links to every staff portal; a driver and a conductor land on their own app.
test.describe("staff portals", () => {
  test("the sign in page links to the driver and conductor portals", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Staff portals" })).toBeVisible();
    await expect(page.getByTestId("portal-driver")).toHaveAttribute("href", "/login?next=%2Fdriver");
    await expect(page.getByTestId("portal-conductor")).toHaveAttribute("href", "/login?next=%2Fconductor");
    await page.getByTestId("portal-driver").click();
    await page.waitForURL(/next=%2Fdriver/);
  });

  test("a driver signs in and lands on the driver portal", async ({ page }) => {
    await login(page, "driver.knl@aptransit.test", "/driver");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/driver");
  });

  test("a conductor signs in and lands on the conductor portal", async ({ page }) => {
    await login(page, "conductor.knl@aptransit.test", "/conductor");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/conductor");
  });
});
