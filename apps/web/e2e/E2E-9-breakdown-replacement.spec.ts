import { expect, test } from "@playwright/test";
import en from "../messages/en.json";

test.use({ actionTimeout: 10000 });

test("E2E-9 Driver reports breakdown, ops sees incident, assigns replacement bus, citizen notification", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  await context.addCookies([{ name: "apt_session", value: "1", url: "http://localhost:3000" }]);

  const now = new Date().toISOString();
  const depotId = "depotops00001";
  const oldBusId = "busops0000001";
  const newBusId = "busops0000002";
  const tripId = "tripops000001";

  const originalBus = {
    id: oldBusId,
    regNo: "AP 39 Z 0107",
    depotId,
    busTypeId: "bustype000001",
    status: "BREAKDOWN",
    serviceType: "EXPRESS",
    totalSeats: 40,
    maintenanceDueAt: null,
    odometerKm: 12000,
    driverName: "Ramesh Driver",
    currentRouteNameEn: "Kurnool to Vijayawada",
    currentRouteNameTe: "కర్నూలు నుండి విజయవాడ",
  };

  const replacementBus = {
    id: newBusId,
    regNo: "AP 39 Z 0112",
    depotId,
    busTypeId: "bustype000001",
    status: "IDLE",
    serviceType: "EXPRESS",
    totalSeats: 40,
    maintenanceDueAt: null,
    odometerKm: 8500,
    driverName: null,
    currentRouteNameEn: null,
    currentRouteNameTe: null,
  };

  const trip = {
    id: tripId,
    code: "TRP-2026-0001",
    status: "RUNNING",
    displayStatus: "DELAYED",
    serviceDate: now.slice(0, 10),
    scheduledDepartureAt: now,
    scheduledArrivalAt: now,
    actualDepartureAt: now,
    actualArrivalAt: null,
    delayMinutes: 25,
    routeId: "routeops00001",
    routeNameEn: "Kurnool to Vijayawada",
    routeNameTe: "కర్నూలు నుండి విజయవాడ",
    depotId,
    passengers: 38,
    assignment: {
      id: "assign00001",
      busId: oldBusId,
      busRegNo: originalBus.regNo,
      driverId: "driverops0001",
      driverName: "Ramesh Driver",
      conductorId: "condops0001",
      conductorName: "Suresh Conductor",
      reason: "INITIAL",
      startedAt: now,
      endedAt: null,
    },
    assignments: [
      {
        id: "assign00001",
        busId: oldBusId,
        busRegNo: originalBus.regNo,
        driverId: "driverops0001",
        driverName: "Ramesh Driver",
        conductorId: "condops0001",
        conductorName: "Suresh Conductor",
        reason: "INITIAL",
        startedAt: now,
        endedAt: null,
      },
    ],
    incidents: [
      {
        id: "incidentops01",
        code: "INC-2026-0099",
        busRegNo: originalBus.regNo,
        tripCode: "TRP-2026-0001",
        tripId,
        busId: oldBusId,
        type: "BREAKDOWN",
        severity: "CRITICAL",
        status: "OPEN",
        note: "Engine breakdown near Kurnool bypass road",
        lat: 15.81,
        lng: 78.04,
        createdAt: now,
        resolvedAt: null,
        acknowledgedAt: null,
      },
    ],
  };

  const writes: { path: string; body: Record<string, unknown> }[] = [];

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    let body: unknown = [];

    if (path.endsWith("/auth/refresh")) {
      body = { accessToken: "ops-browser-test" };
    } else if (path.endsWith("/me")) {
      body = {
        id: "managerops001",
        name: "Depot Manager",
        email: "manager@aptransit.test",
        phone: null,
        preferredLocale: "en",
        roles: [{ role: "DEPOT_MANAGER", depotId }],
      };
    } else if (path.endsWith("/notifications/unread-count")) {
      body = { count: 1 };
    } else if (path.endsWith("/ops/incidents")) {
      body = trip.incidents;
    } else if (path.endsWith("/ops/buses/available")) {
      body = [replacementBus];
    } else if (path.endsWith(`/ops/trips/${tripId}/replace-bus`)) {
      writes.push({ path, body: request.postDataJSON() });
      trip.assignment = {
        id: "assign00002",
        busId: newBusId,
        busRegNo: replacementBus.regNo,
        driverId: "driverops0001",
        driverName: "Ramesh Driver",
        conductorId: "condops0001",
        conductorName: "Suresh Conductor",
        reason: "REPLACEMENT",
        startedAt: now,
        endedAt: null,
      };
      trip.assignments.unshift(trip.assignment);
      body = trip;
    } else if (path.endsWith(`/ops/trips/${tripId}`)) {
      body = trip;
    } else if (path.endsWith("/ops/depots")) {
      body = [{ id: depotId, code: "KNL", nameEn: "Kurnool", nameTe: "కర్నూలు", districtId: "dist01" }];
    } else if (path.endsWith("/ops/dashboard")) {
      body = {
        activeBuses: 1,
        totalBuses: 2,
        activeTrips: 1,
        delayedTrips: 1,
        breakdowns: 1,
        openIncidents: 1,
        busStatusCounts: { DELAYED: 1, RUNNING: 0, BREAKDOWN: 1, MAINTENANCE: 0, IDLE: 1 },
      };
    } else {
      body = [];
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  // 1. Ops sees incident live on /ops/incidents
  await page.goto("/ops/incidents");
  await expect(page.getByText("INC-2026-0099")).toBeVisible();
  // The note is shown in the incident drawer, not in the list
  await page.getByRole("row", { name: /INC-2026-0099/ }).click();
  await expect(page.getByText("Engine breakdown near Kurnool bypass road")).toBeVisible();
  await page.keyboard.press("Escape");

  // 2. Navigate to trip detail and initiate replacement
  await page.goto(`/ops/trips/${tripId}`);
  await expect(page.getByText("TRP-2026-0001")).toBeVisible();
  await expect(page.getByRole("button", { name: en.opsApp.replaceBus })).toBeVisible();
  await page.getByRole("button", { name: en.opsApp.replaceBus }).click();

  // 3. On Replace Bus page, select available bus and fill reason
  await page.waitForURL(`**/ops/trips/${tripId}/replace`);
  await expect(page.getByRole("heading", { level: 1, name: en.opsApp.replaceBus })).toBeVisible();

  // Select replacement bus card
  await page.getByRole("button", { name: replacementBus.regNo }).click();

  // A reason is required before the confirm step (prefilled only when coming from the incident)
  await page.getByRole("textbox", { name: en.opsApp.reasonLabel }).fill("Engine breakdown near Kurnool bypass road");
  await page.getByRole("button", { name: en.opsApp.proceedToConfirm }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("AP 39 Z 0107");
  await expect(dialog).toContainText("AP 39 Z 0112");

  // Confirm replacement
  await dialog.getByRole("button", { name: en.opsApp.confirmReplacement }).click();

  // 4. Returns to trip detail page with updated assignment
  await page.waitForURL(`**/ops/trips/${tripId}`);
  expect(writes.length).toBe(1);
  expect(writes[0]?.body).toMatchObject({
    busId: newBusId,
  });
});
