import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import telugu from "../messages/te.json";
import messages from "../messages/en.json";

test("E2E-8 scanner reasons, duplicate debounce and manual live code", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  await context.addCookies([{ name: "apt_session", value: "1", url: "http://localhost:3000" }]);
  let result: Record<string, unknown> = { result: "VALID", reason: "OK" };
  const requests: Record<string, unknown>[] = [];
  const now = new Date().toISOString();
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown;
    if (path.endsWith("/auth/refresh")) body = { accessToken: "scanner-test" };
    else if (path.endsWith("/me"))
      body = {
        id: "conductor00001",
        name: "Conductor",
        email: null,
        phone: null,
        preferredLocale: "en",
        roles: [{ role: "CONDUCTOR", depotId: "depot00001" }],
      };
    else if (path.endsWith("/conductor/today"))
      body = {
        trip: {
          id: "tripscanner001",
          code: "TRP-TEST",
          status: "RUNNING",
          displayStatus: "RUNNING",
          serviceDate: now.slice(0, 10),
          scheduledDepartureAt: now,
          scheduledArrivalAt: now,
          actualDepartureAt: now,
          actualArrivalAt: null,
          delayMinutes: 0,
        },
        route: { nameEn: "Kurnool to Nandyal", nameTe: "??????? ????? ???????" },
        counts: {
          passengers: 10,
          checked: requests.length,
          pending: Math.max(0, 10 - requests.length),
        },
      };
    else if (path.endsWith("/tickets/validate")) {
      requests.push(route.request().postDataJSON());
      body = result;
    } else if (path.endsWith("/notifications/unread-count")) body = { count: 0 };
    else return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.goto("/conductor/scan");
  await expect(page.getByRole("button", { name: "Enter ticket details" })).toBeVisible();
  const inject = async (text: string) =>
    page.evaluate(
      (text) => window.dispatchEvent(new CustomEvent("apt:test-scan", { detail: text })),
      text,
    );
  for (const reason of Object.keys(messages.conductorApp.reasons)) {
    result = {
      result: reason === "OK" ? "VALID" : "INVALID",
      reason,
      earlierScanAt: now,
      context: {
        validUntil: now,
        route: "Kurnool to Nandyal",
        departureAt: now,
        serviceDate: now.slice(0, 10),
        services: ["ORDINARY"],
        // D-035 segment reasons name the ticket's own stops
        ticketFrom: { nameEn: "Kurnool", nameTe: "కర్నూలు" },
        ticketTo: { nameEn: "Nandyal", nameTe: "నంద్యాల" },
      },
      ...(reason === "OK"
        ? {
            ticket: {
              passengerName: "Test Passenger",
              seatNo: "1",
              routeName: "Kurnool to Nandyal",
              boarding: "Kurnool",
              dropping: "Nandyal",
              type: "SINGLE",
            },
          }
        : {}),
    };
    await inject("fixture-" + reason);
    await expect(
      page.getByRole("status").filter({ hasText: reason === "OK" ? "VALID" : "INVALID" }),
    ).toBeVisible({ timeout: 2000 });
    await expect(
      page
        .getByText(
          messages.conductorApp.reasons[reason as keyof typeof messages.conductorApp.reasons].line,
          { exact: true },
        )
        .first(),
    ).toBeVisible();
    if (reason === "OK") await expect(page.getByText("Test Passenger")).toBeVisible();
    if (reason === "PAST_DESTINATION") await expect(page.getByText("This ticket ends at Nandyal")).toBeVisible();
    if (reason === "BEFORE_BOARDING_STOP") await expect(page.getByText("This ticket starts at Kurnool")).toBeVisible();
    await inject("fixture-" + reason);
    await page.getByRole("button", { name: "Tap anywhere to continue" }).click();
  }
  // One request per reason: the second inject of each is debounced as a duplicate
  const reasonCount = Object.keys(messages.conductorApp.reasons).length;
  expect(requests).toHaveLength(reasonCount);
  expect(requests[0]).toMatchObject({ qr: "fixture-OK", tripId: "tripscanner001" });
  await page.getByRole("button", { name: "Enter ticket details" }).click();
  await inject("qr-during-manual-entry");
  await page.waitForTimeout(300);
  // A QR seen while typing a manual entry is ignored
  expect(requests).toHaveLength(reasonCount);
  await page.getByLabel("Ticket number", { exact: true }).fill("APT-1234-5678");
  await page.getByLabel("Live 8-character validation code").fill("ABCDEFG2");
  result = { result: "VALID", reason: "OK" };
  await page.getByRole("button", { name: "Check ticket", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "VALID" })).toBeVisible();
  expect(requests.at(-1)).toMatchObject({
    ticketNumber: "APT-1234-5678",
    liveCode: "ABCDEFG2",
    tripId: "tripscanner001",
  });
  expect(requests.at(-1)).not.toHaveProperty("qr");
  await expect(page.getByRole("button", { name: "Tap anywhere to continue" })).toBeHidden({
    timeout: 5000,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    accessibility.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
  ).toEqual([]);
  await page.goto("/conductor");
  for (const locale of ["en", "te"] as const) {
    await page
      .locator("button[lang=" + locale + "]")
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      locale === "en" ? messages.conductorApp.today : telugu.conductorApp.today,
    );
    for (const width of [360, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        locale + " " + width,
      ).toBe(true);
    }
  }
});
