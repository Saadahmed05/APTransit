import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import en from "../messages/en.json";
import te from "../messages/te.json";

test.use({ actionTimeout: 10000 });

test("operations screens, actions, scope and bilingual layouts", async ({ page, context }) => {
  test.setTimeout(180000);
  await context.addCookies([{ name: "apt_session", value: "1", url: "http://localhost:3000" }]);
  const now = new Date().toISOString(), depotId = "depotops00001", busId = "busops0000001";
  const bus = { id: busId, regNo: "AP21AB1234", depotId, busTypeId: "bustype000001", status: "IDLE", serviceType: "EXPRESS", totalSeats: 40, maintenanceDueAt: null, odometerKm: 0, driverName: "Driver", currentRouteNameEn: "Kurnool to Nandyal", currentRouteNameTe: "KNL to NDL" };
  const trip = { id: "tripops000001", code: "TRP-OPS", status: "SCHEDULED", displayStatus: "UPCOMING", serviceDate: now.slice(0, 10), scheduledDepartureAt: now, scheduledArrivalAt: now, actualDepartureAt: null, actualArrivalAt: null, delayMinutes: 0, routeId: "routeops00001", routeNameEn: "Kurnool to Nandyal", routeNameTe: "KNL to NDL", depotId, passengers: 3, assignment: null };
  const incident = { id: "incidentops01", code: "INC-OPS", busRegNo: bus.regNo, tripCode: trip.code, tripId: trip.id, busId, type: "BREAKDOWN", severity: "HIGH", status: "OPEN", note: "Engine stopped", lat: 15.81, lng: 78.04, createdAt: now, resolvedAt: null, acknowledgedAt: null };
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  let empty = false, fail = false;
  await page.route("**/api/v1/**", async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    let body: unknown = [];
    if (path.endsWith("/auth/refresh")) body = { accessToken: "ops-browser-test" };
    else if (path.endsWith("/me")) body = { id: "managerops001", name: "Manager", email: null, phone: null, preferredLocale: "en", roles: [{ role: "STATE_ADMIN" }] };
    else if (path.endsWith("/notifications/unread-count")) body = { count: 0 };
    else if (fail && path.includes("/ops/")) return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ code: "INTERNAL", message: "Unavailable" }) });
    else if (request.method() === "POST") {
      writes.push({ path, body: request.postDataJSON() });
      if (path.endsWith("/acknowledge")) { incident.status = "ACKNOWLEDGED"; body = incident; }
      else if (path.endsWith("/resolve")) { incident.status = "RESOLVED"; body = incident; }
      else body = path.endsWith("/assign") ? trip : bus;
    } else if (path.endsWith("/tracking/live")) body = [0, 1].map(index => ({ tripId: index ? "tripops000002" : trip.id, tripCode: trip.code, busId: index ? "busops000002" : busId, busRegNo: index ? "AP21AB5678" : bus.regNo, routeId: trip.routeId, routeCode: "KNL-NDL", depotId, lat: 15.81, lng: 78.04 + index * 0.5, speedKmh: 30, headingDeg: 0, recordedAt: now, delayMinutes: 0, displayStatus: "RUNNING", progressPct: 10, nextStopId: null }));
    else if (path.endsWith("/ops/dashboard")) body = { activeBuses: 0, totalBuses: 1, activeTrips: 0, delayedTrips: 0, breakdowns: 1, openIncidents: 1, busStatusCounts: { DELAYED: 0, RUNNING: 0, BREAKDOWN: 1, MAINTENANCE: 0, IDLE: 0 } };
    else if (path.endsWith("/ops/depots")) body = [{ id: depotId, code: "KNL", nameEn: "Kurnool", nameTe: "KNL", districtId: "district00001" }];
    else if (path.endsWith("/ops/bus-types")) body = [{ id: bus.busTypeId, nameEn: "Express", nameTe: "Express", serviceType: "EXPRESS", totalSeats: 40 }];
    else if (path.endsWith("/ops/buses") || path.endsWith("/ops/buses/available")) body = empty ? [] : [bus];
    else if (path.endsWith("/ops/trips")) body = empty ? [] : [trip];
    else if (path.endsWith("/ops/trips/" + trip.id)) body = { ...trip, assignments: [], incidents: [incident] };
    else if (path.endsWith("/ops/incidents")) body = empty ? [] : [incident];
    else if (path.endsWith("/ops/routes")) body = [{ id: trip.routeId, code: "KNL-NDL", nameEn: trip.routeNameEn, nameTe: trip.routeNameTe }];
    else if (path.endsWith("/ops/staff")) body = [{ id: "driverops0001", userId: "userdriver001", depotId, type: url.searchParams.get("type"), email: null, name: "Driver", employeeCode: "EMP1" }];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.route("https://tiles.openfreemap.org/**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ version: 8, sources: {}, layers: [] }) }));
  await page.goto("/ops/buses");
  await expect(page.getByRole("cell", { name: bus.regNo })).toBeVisible();
  await page.getByLabel(en.opsApp.depot, { exact: true }).selectOption(depotId);
  await expect(page).toHaveURL(/depot=depotops00001/);
  await page.getByRole("button", { name: en.opsApp.addBus }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[name="regNo"]').fill("AP21AB1234");
  await dialog.locator('select[name="busTypeId"]').selectOption(bus.busTypeId);
  await dialog.locator('select[name="depotId"]').selectOption(depotId);
  await dialog.getByRole("button", { name: en.opsApp.saveBus }).click();
  await expect(dialog).not.toBeVisible();
  expect(writes[0]?.body).toMatchObject({ regNo: bus.regNo, depotId });
  await page.goto("/ops/trips?depot=" + depotId);
  await page.getByRole("button", { name: en.opsApp.assign, exact: true }).click();
  await dialog.locator('select[name="bus"]').selectOption(busId);
  await dialog.locator('select[name="driver"]').selectOption("driverops0001");
  await dialog.getByRole("button", { name: en.opsApp.saveAssignment, exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.goto("/ops/incidents");
  await page.getByRole("button", { name: incident.code }).click();
  await dialog.getByRole("button", { name: en.opsApp.acknowledge }).click();
  await expect(dialog).toContainText(en.opsApp.incidentStatus.ACKNOWLEDGED);
  await dialog.locator("textarea").fill("Repair completed");
  await dialog.getByRole("button", { name: en.opsApp.resolve, exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("table").getByText(en.opsApp.incidentStatus.RESOLVED, { exact: true })).toBeVisible();
  await page.goto("/ops");
  await expect(page.getByRole("button", { name: bus.regNo, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "AP21AB5678", exact: true })).toBeVisible();
  await page.getByRole("button", { name: bus.regNo, exact: true }).click();
  await expect(page.getByText("Route: Kurnool to Nandyal", { exact: true })).toBeVisible();
  for (const locale of ["en", "te"] as const) {
    await context.addCookies([{ name: "locale", value: locale, url: "http://localhost:3000" }]);
    for (const width of [360, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ["/ops", "/ops/buses", "/ops/trips", "/ops/incidents"]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.getByRole("heading", { level: 1 })).not.toContainText("opsApp.");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    }
    await context.addCookies([{ name: "theme", value: "dark", url: "http://localhost:3000" }]);
    await page.reload();
    const audit = await new AxeBuilder({ page }).analyze();
    expect(audit.violations.filter(v => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);
  }
  empty = true;
  await page.goto("/ops/buses");
  await expect(page.getByText(te.opsApp.empty, { exact: true })).toBeVisible();
  fail = true;
  await page.goto("/ops/trips");
  await expect(page.getByRole("button", { name: te.common.retry }).first()).toBeVisible();
});
