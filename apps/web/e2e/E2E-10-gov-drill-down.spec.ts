import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import en from "../messages/en.json";
import { login } from "./helpers";

// docs/14 E2E-10: command center loads, drill down district to trip, export CSV. Needs the real
// API with the seed and 14 days of history (pnpm db:seed --history 14) and OTP_DEV_ECHO=1.

test("E2E-10 Gov: command center, drill down to a trip, CSV export", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page, "transport@aptransit.test", "/gov");

  await expect(page.getByRole("heading", { level: 1, name: en.govApp.title })).toBeVisible();
  await expect(page.getByText(en.govApp.kpi.activeBuses)).toBeVisible();

  // State to district: the district list mirrors the map markers
  await page.getByRole("list", { name: en.govApp.districts }).getByRole("link", { name: /Kurnool/ }).click();
  await expect(page).toHaveURL(/\/gov\/district\//);
  // D-034: the root crumb is the state name from GET /states (the seed state)
  await expect(page.getByRole("navigation", { name: en.govApp.breadcrumb })).toContainText("Andhra Pradesh");

  // District to depot
  await page.getByRole("link", { name: /Kurnool/ }).filter({ hasText: /buses active/ }).first().click();
  await expect(page).toHaveURL(/\/gov\/depot\//);
  await expect(page.getByRole("heading", { level: 2, name: en.govApp.routes })).toBeVisible();

  // Depot to route
  await page.getByRole("link", { name: /KNL-VJA-01/ }).first().click();
  await expect(page).toHaveURL(/\/gov\/route\//);
  await expect(page.getByRole("heading", { level: 2, name: en.govApp.delayByHour })).toBeVisible();

  // Route to trip
  await page.getByRole("table", { name: en.govApp.tripsToday }).getByRole("link").first().click();
  await expect(page).toHaveURL(/\/gov\/trip\//);
  await expect(page.getByRole("heading", { level: 2, name: en.govApp.tripFacts })).toBeVisible();
  await expect(page.getByRole("navigation", { name: en.govApp.breadcrumb }).getByRole("link")).toHaveCount(4);

  // Reports: the daily operations CSV downloads with the BOM so Excel keeps Telugu
  await page.goto("/gov/reports");
  const daily = page.getByRole("region", { name: en.govApp.reports.cards.daily.title });
  const download = page.waitForEvent("download");
  await daily.getByRole("button", { name: en.govApp.reports.download }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^daily-operations-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv$/);
  const text = readFileSync((await file.path())!, "utf8");
  expect(text.charCodeAt(0)).toBe(0xfeff);
  expect(text).toContain("Date,District,Depot,Trips scheduled");
});
