import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("E2E-7: driver starts, simulator points reach citizen tracking, fallback and incident", async ({
  page,
  request,
}, testInfo) => {
  test.skip(process.env.E2E_PAYMENTS_FAKE !== "1", "requires the seeded development stack");
  test.setTimeout(120_000);
  const tripId = execFileSync(
    process.execPath,
    [resolve(__dirname, "../../api/node_modules/tsx/dist/cli.mjs"), "scripts/demo-tracking.ts"],
    { cwd: resolve(__dirname, "../../api"), encoding: "utf8" },
  ).trim();
  expect(tripId).toMatch(/^[a-z0-9]{8,40}$/);
  const otp = await request.post("/api/v1/auth/otp/request", {
    data: { channel: "EMAIL", target: "driver.knl@aptransit.test" },
  });
  expect(otp.status()).toBe(202);
  const { devCode } = await otp.json();
  const login = await request.post("/api/v1/auth/otp/verify", {
    data: { channel: "EMAIL", target: "driver.knl@aptransit.test", code: devCode },
  });
  expect(login.status()).toBe(200);
  const { accessToken } = await login.json();
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "X-Device-Key": "sim_driver_key_kurnool_01",
  };
  await page.goto(`/track/${tripId}`);
  await expect(page.getByText(/Tracking starts when/)).toBeVisible();
  const start = await request.post(`/api/v1/driver/trips/${tripId}/start`, { headers });
  expect(start.status()).toBe(200);
  const trip = await (await request.get(`/api/v1/trips/${tripId}`)).json();
  const [origin, stop] = trip.route.stops;
  const ping = async (lat: number, lng: number) => {
    const response = await request.post("/api/v1/tracking/ping", {
      headers,
      data: {
        tripId,
        points: [
          {
            lat,
            lng,
            speedKmh: 40,
            accuracyM: 8,
            headingDeg: 90,
            recordedAt: new Date().toISOString(),
          },
        ],
      },
    });
    expect(response.status()).toBe(202);
  };
  await ping(origin.lat, origin.lng);
  await expect(page.getByTestId("next-stop")).toContainText(stop.nameEn, { timeout: 15_000 });
  await expect(page.getByTestId("live-eta")).toContainText(/Arriving/);
  // Record live requests so each next ping waits for the previous position update, without sleeps.
  await expect(async () => {
    await ping(stop.lat, stop.lng);
    await expect(page.getByTestId("next-stop")).not.toContainText(stop.nameEn);
  }).toPass({ intervals: [2500], timeout: 15_000 });
  const incident = await request.post("/api/v1/driver/incidents", {
    headers,
    data: { type: "BREAKDOWN" },
  });
  expect(incident.status()).toBe(201);
  await expect(page.getByText("Breakdown", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.screenshot({
    path: resolve(__dirname, `../../../.local/day12-${testInfo.project.name}.png`),
    fullPage: true,
  });
  // Block reconnection, force a transport disconnect and observe the 10 s fallback threshold.
  await page.route("**/socket.io/**", (route) => route.abort());
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await page.context().setOffline(true);
  await expect(page.getByText(/Live connection interrupted/)).toBeVisible({ timeout: 35_000 });
  await page.context().setOffline(false);
  const polled = await page.waitForResponse(
    (r) => r.url().includes(`/tracking/trips/${tripId}/live`) && r.status() === 200,
    { timeout: 35_000 },
  );
  expect((await polled.json()).hasOpenIncident).toBe(true);
  await page.unroute("**/socket.io/**");
  await request.post(`/api/v1/driver/trips/${tripId}/end`, { headers });
  await expect(page.getByText("This trip is complete")).toBeVisible({ timeout: 35_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
