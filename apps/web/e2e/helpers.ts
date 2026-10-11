import { expect, type Page } from "@playwright/test";
import { PLATFORM_TIME_ZONE } from "@aptransit/shared";

// Shared steps for the citizen journeys (docs/14). Needs the API with OTP_DEV_ECHO=1 and
// PAYMENTS_FAKE=1, the web built with NEXT_PUBLIC_PAYMENTS_FAKE=1, and a seeded database.

/** Tomorrow (or `days` from now) as YYYY-MM-DD in IST. */
export function tomorrowIst(days = 1): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PLATFORM_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(Date.now() + days * 24 * 3_600_000),
  );
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100_000)}@example.test`;
}

/** Log in with the dev echoed code and land on `next`. */
export async function login(page: Page, email: string, next = "/"): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByRole("textbox", { name: /email address/i }).fill(email);
  const otpResponse = page.waitForResponse((res) => res.url().includes("/auth/otp/request") && res.request().method() === "POST");
  await page.keyboard.press("Enter");
  const { devCode } = (await (await otpResponse).json()) as { devCode?: string };
  expect(devCode, "API must run with OTP_DEV_ECHO=1").toMatch(/^\d{6}$/);
  await page.getByRole("textbox", { name: /digit 1 of 6/i }).click();
  await page.keyboard.type(devCode!);
  await page.waitForURL((url) => url.pathname === next, { timeout: 20_000 });
}

/**
 * A Kurnool to Vijayawada trip tomorrow that leaves at least 3 hours from now. E2E-3 moves one
 * trip into its activation window (demo:window), so "the first card" is not always a far trip,
 * and after many runs tomorrow can run out: then the day after tomorrow is used.
 */
export async function pickTrip(page: Page): Promise<{ tripId: string; from: string; to: string; date: string }> {
  const place = async (q: string) => {
    const res = await page.request.get(`/api/v1/places/search?q=${encodeURIComponent(q)}&limit=1`);
    return ((await res.json()) as { id: string }[])[0]!.id;
  };
  const from = await place("Kurnool");
  const to = await place("Vijayawada");
  for (const days of [1, 2]) {
    const date = tomorrowIst(days);
    const res = await page.request.get(`/api/v1/search/trips?from=${from}&to=${to}&date=${date}`);
    const trips = (await res.json()) as { tripId: string; departureAt: string; seatsLeft: number }[];
    const far = trips.filter((t) => Date.parse(t.departureAt) > Date.now() + 3 * 3_600_000 && t.seatsLeft > 0);
    if (far.length) return { tripId: far[Math.floor(Math.random() * far.length)]!.tripId, from, to, date };
  }
  throw new Error("seed must have a trip tomorrow or the day after that leaves in 3 hours or more");
}

/** Books one random free seat on a far Kurnool to Vijayawada trip tomorrow and pays (fake). Returns the booking id. */
export async function bookAndPay(page: Page): Promise<string> {
  const { tripId, from, to, date } = await pickTrip(page);
  await page.goto(`/search?from=${from}&to=${to}&date=${date}`);
  await page.locator(`a[data-testid='trip-card'][href*='${tripId}']`).click();
  await page.waitForURL(/\/bus\//);
  await page.getByRole("button", { name: /^book ticket/i }).click();
  await page.waitForURL(/\/book\/[^/]+\?/);
  const free = page.getByRole("button", { name: /^Seat \d+, available$/ });
  await expect(free.first()).toBeVisible();
  await free.nth(Math.floor(Math.random() * (await free.count()))).click();
  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.waitForURL(/\/details$/);
  await page.getByLabel(/full name/i).first().fill("E2E Passenger");
  await page.getByLabel(/^age/i).first().fill("30");
  await page.getByText("Female", { exact: true }).first().click();
  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.waitForURL(/\/review\?booking=/);
  await page.getByRole("button", { name: /^pay/i }).click();
  await page.waitForURL(/\/book\/done\//, { timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Ticket booked" })).toBeVisible({ timeout: 15_000 });
  return page.url().split("/book/done/")[1]!.split("?")[0]!;
}
