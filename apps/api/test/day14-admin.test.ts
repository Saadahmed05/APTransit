/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { getQueueToken } from "@nestjs/bullmq";
import request from "supertest";
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest";
import { AdminService } from "../src/modules/admin/admin.service";
import { decodePolyline } from "@aptransit/shared";
import { AppModule } from "../src/app.module";
import { configureHttpApp } from "../src/http-app";
import { PrismaService } from "../src/prisma/prisma.service";
import { RedisService } from "../src/redis/redis.service";
import { AuthService } from "../src/modules/auth/auth.service";
import { QUEUES } from "../src/modules/queue/queue.constants";
import { createMemoryPrisma, type Tables } from "./memory-prisma";
import { createFakeRedis } from "./fake-redis";
const tables: Tables = {},
  redis = createFakeRedis();
const by = (model: string, id: string) => tables[model]?.find((r) => r.id === id);
const route = (id: string) => ({
  ...by("route", id),
  routeStops: tables.routeStop
    ?.filter((r) => r.routeId === id)
    .map((r) => ({ ...r, stop: by("stop", r.stopId) })),
  depot: by("depot", "depottest0001"),
});
const prisma = createMemoryPrisma(
  tables,
  {
    route: { routeStops: (r) => tables.routeStop?.filter((s) => s.routeId === r.id) },
    timetable: { route: (t) => route(t.routeId) },
    trip: {
      route: (t) => route(t.routeId),
      busType: (t) => by("busType", t.busTypeId),
      assignments: () => [],
    },
    ticket: { trip: (t) => by("trip", t.tripId) },
    depot: { district: (d) => by("district", d.districtId) },
    user: { userRoles: (u) => tables.userRole?.filter((r) => r.userId === u.id) },
    auditLog: {
      actorUser: (a) => ({
        ...by("user", a.actorUserId),
        userRoles: tables.userRole?.filter((r) => r.userId === a.actorUserId),
      }),
    },
  },
  {
    userRole: { depotId: null, districtId: null, stateId: null },
    stop: { busStandId: null },
    timetable: { validTo: null },
    fareRule: { validTo: null },
    auditLog: { before: null, after: null, actorRole: null, actorUserId: null },
    user: { deletedAt: null },
    setting: { updatedById: null },
  },
);
const stateId = "statetest0001",
  otherStateId = "statetest0002",
  districtId = "districttest01",
  depotId = "depottest0001",
  stop1 = "stoptest00001",
  stop2 = "stoptest00002",
  stop3 = "stoptest00003",
  routeId = "routetest00001",
  busTypeId = "bustypetest01",
  tripId = "triptest000001";
const stopBody = {
  code: "TST4",
  nameEn: "Fourth stop",
  nameTe: "Fourth stop",
  districtId,
  lat: 15.8,
  lng: 78,
};
const routeBody = {
  code: "TST-NEW",
  nameEn: "Test route",
  nameTe: "Test route",
  depotId,
  isActive: true,
  stops: [
    { stopId: stop1, kmFromOrigin: 0, minutesFromOrigin: 0, isBoarding: true, isDropping: false },
    { stopId: stop2, kmFromOrigin: 20, minutesFromOrigin: 30, isBoarding: true, isDropping: true },
  ],
};
describe("Day 14 admin HTTP", () => {
  let app: NestExpressApplication, admin: string, root: string, manager: string, citizen: string;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(RedisService)
      .useValue(redis)
      .overrideProvider(getQueueToken(QUEUES.NOTIFICATIONS))
      .useValue({ add: async () => ({}) })
      .overrideProvider(getQueueToken(QUEUES.EXPIRY))
      .useValue({ add: async () => ({}) })
      .compile();
    app = module.createNestApplication({ logger: false, rawBody: true });
    configureHttpApp(app);
    await app.init();
    const auth = module.get(AuthService) as any;
    admin = await auth.generateAccessToken("admintest0001", [{ role: "STATE_ADMIN", stateId }]);
    root = await auth.generateAccessToken("roottest00001", [{ role: "SUPER_ADMIN" }]);
    manager = await auth.generateAccessToken("managertest01", [{ role: "DEPOT_MANAGER", depotId }]);
    citizen = await auth.generateAccessToken("citizentest01", [{ role: "CITIZEN" }]);
  });
  afterAll(() => app.close());
  beforeEach(() => {
    Object.keys(tables).forEach((k) => delete tables[k]);
    redis.store.clear();
    const now = new Date(),
      past = new Date(+now - 86400000),
      future = new Date(+now + 86400000);
    Object.assign(tables, {
      state: [
        { id: stateId, code: "AP" },
        { id: otherStateId, code: "TG" },
      ],
      district: [{ id: districtId, code: "TST", nameEn: "Test", nameTe: "Test", stateId }],
      depot: [{ id: depotId, code: "TST", nameEn: "Test depot", nameTe: "Test depot", districtId }],
      busStand: [],
      busType: [
        {
          id: busTypeId,
          nameEn: "Express",
          nameTe: "Express",
          serviceType: "EXPRESS",
          totalSeats: 4,
        },
      ],
      stop: [
        {
          id: stop1,
          code: "TST1",
          nameEn: "First",
          nameTe: "First",
          districtId,
          lat: 15.8,
          lng: 78,
          busStandId: null,
        },
        {
          id: stop2,
          code: "TST2",
          nameEn: "Second",
          nameTe: "Second",
          districtId,
          lat: 16,
          lng: 78.2,
          busStandId: null,
        },
        {
          id: stop3,
          code: "TST3",
          nameEn: "Third",
          nameTe: "Third",
          districtId,
          lat: 16.2,
          lng: 78.4,
          busStandId: null,
        },
      ],
      route: [
        {
          id: routeId,
          code: "TST",
          nameEn: "Test route",
          nameTe: "Test route",
          originStopId: stop1,
          destinationStopId: stop3,
          depotId,
          polyline: "",
          distanceKm: 40,
          isActive: true,
        },
      ],
      routeStop: [
        {
          id: "routestop0001",
          routeId,
          stopId: stop1,
          seq: 0,
          kmFromOrigin: 0,
          minutesFromOrigin: 0,
          isBoarding: true,
          isDropping: false,
        },
        {
          id: "routestop0002",
          routeId,
          stopId: stop2,
          seq: 1,
          kmFromOrigin: 20,
          minutesFromOrigin: 30,
          isBoarding: true,
          isDropping: true,
        },
        {
          id: "routestop0003",
          routeId,
          stopId: stop3,
          seq: 2,
          kmFromOrigin: 40,
          minutesFromOrigin: 60,
          isBoarding: false,
          isDropping: true,
        },
      ],
      timetable: [
        {
          id: "timetabletest1",
          routeId,
          busTypeId,
          departureLocal: "09:00",
          daysMask: 127,
          validFrom: past,
          validTo: null,
          isActive: true,
        },
      ],
      trip: [
        {
          id: tripId,
          code: "TRP-TST",
          routeId,
          busTypeId,
          scheduledDepartureAt: future,
          scheduledArrivalAt: new Date(+future + 3600000),
          serviceDate: future,
          status: "SCHEDULED",
        },
      ],
      ticket: [],
      user: [
        {
          id: "admintest0001",
          name: "Admin",
          email: "admin@aptransit.test",
          phone: null,
          deletedAt: null,
        },
        {
          id: "roottest00001",
          name: "Root",
          email: "root@aptransit.test",
          phone: null,
          deletedAt: null,
        },
        {
          id: "citizentest01",
          name: "Citizen",
          email: "citizen@aptransit.test",
          phone: null,
          deletedAt: null,
        },
        {
          id: "managertest01",
          name: "Manager",
          email: "manager@aptransit.test",
          phone: null,
          deletedAt: null,
        },
      ],
      userRole: [
        {
          id: "rootroletest01",
          userId: "roottest00001",
          role: "SUPER_ADMIN",
          depotId: null,
          districtId: null,
          stateId: null,
        },
        {
          id: "adminroletest1",
          userId: "admintest0001",
          role: "STATE_ADMIN",
          depotId: null,
          districtId: null,
          stateId,
        },
        {
          id: "managerrole01",
          userId: "managertest01",
          role: "DEPOT_MANAGER",
          depotId,
          districtId: null,
          stateId: null,
        },
      ],
      passType: [
        {
          id: "passtypeday00001",
          kind: "DAY",
          nameEn: "Day Pass",
          nameTe: "Day te",
          durationDays: 1,
          validityMode: "UNTIL_DAY_END",
          pricePaise: 12_000,
          eligibleServiceTypes: ["EXPRESS"],
          scheme: null,
          groupSize: 1,
          routeRestricted: false,
          isDemo: true,
          sortOrder: 1,
          isActive: true,
          stateId: null,
        },
      ],
      // One sold DAY pass with its purchase time copy (D-036)
      pass: [{ id: "passsold000001", passTypeId: "passtypeday00001", status: "READY", pricePaise: 12_000, durationDays: 1 }],
      fareRule: [
        {
          id: "fareruletest01",
          busTypeId,
          baseFarePaise: 0,
          perKmPaise: 100,
          minFarePaise: 0,
          reservationFeePaise: 500,
          validFrom: past,
          validTo: null,
        },
      ],
      refundPolicy: [
        {
          id: "refundtest0001",
          name: "Current",
          tiers: [
            { minHoursBefore: 24, percent: 90 },
            { minHoursBefore: 1, percent: 50 },
            { minHoursBefore: 0, percent: 0 },
          ],
          validFrom: past,
          cancellationFeePaise: 0,
          isActive: true,
        },
      ],
      setting: [],
      auditLog: [],
    });
  });
  const get = (path: string, token = admin) =>
    request(app.getHttpServer())
      .get("/api/v1/admin/" + path)
      .auth(token, { type: "bearer" });
  const write = (
    method: "post" | "put" | "patch" | "delete",
    path: string,
    body: object = {},
    token = admin,
  ) =>
    request(app.getHttpServer())[method]("/api/v1/admin/" + path)
      .auth(token, { type: "bearer" })
      .send(body);
  describe("pass types (D-036)", () => {
    const body = {
      kind: "FAMILY",
      nameEn: "Family Pass",
      nameTe: "Family te",
      durationDays: 7,
      validityMode: "ROLLING_DAYS",
      pricePaise: 100_000,
      eligibleServiceTypes: ["EXPRESS"],
      scheme: null,
      groupSize: 4,
      routeRestricted: false,
      isDemo: true,
      sortOrder: 4,
      isActive: true,
      stateId: null,
    };

    it("lists, creates and edits with policy:write and an audit row; sold passes keep their price", async () => {
      expect((await get("pass-types", manager)).status).toBe(403);
      const list = await get("pass-types").expect(200);
      expect(list.body).toEqual([expect.objectContaining({ id: "passtypeday00001", pricePaise: 12_000, soldCount: 1 })]);

      const edited = await write("patch", "pass-types/passtypeday00001", { pricePaise: 15_000, isDemo: false });
      expect(edited.status, edited.text).toBe(200);
      expect(edited.body).toMatchObject({ pricePaise: 15_000, isDemo: false, soldCount: 1 });
      expect(tables.pass![0]).toMatchObject({ pricePaise: 12_000, durationDays: 1 });
      expect(tables.auditLog!.find((a) => a.action === "pass_type.update")).toMatchObject({
        entityId: "passtypeday00001",
        before: expect.objectContaining({ pricePaise: 12_000 }),
        after: expect.objectContaining({ pricePaise: 15_000 }),
      });

      const created = await write("post", "pass-types", body);
      expect(created.status, created.text).toBe(201);
      expect(created.body).toMatchObject({ kind: "FAMILY", groupSize: 4, soldCount: 0 });
      expect(tables.auditLog!.map((a) => a.action)).toEqual(["pass_type.update", "pass_type.create"]);
    });

    it("refuses bad input and changes to kind, scheme or state", async () => {
      expect((await write("patch", "pass-types/passtypeday00001", {})).status).toBe(400);
      expect((await write("patch", "pass-types/passtypeday00001", { kind: "ANNUAL" })).status).toBe(400);
      expect((await write("patch", "pass-types/passtypeday00001", { pricePaise: -1 })).status).toBe(400);
      expect((await write("patch", "pass-types/passtypeday00001", { groupSize: 0 })).status).toBe(400);
      expect((await write("post", "pass-types", { ...body, eligibleServiceTypes: [] })).status).toBe(400);
      expect((await write("patch", "pass-types/missingpasstype1", { pricePaise: 1 })).status).toBe(404);
      expect((await write("patch", "pass-types/passtypeday00001", { pricePaise: 1 }, manager)).status).toBe(403);
    });
  });
  it.each(["stops", "routes", "timetables", "users", "fare-rules", "refund-policies", "settings", "pass-types"])(
    "enforces read permission matrix for %s",
    async (path) => {
      expect((await get(path, manager)).status).toBe(403);
      expect((await get(path, citizen)).status).toBe(403);
      expect((await get(path)).status).toBe(200);
      expect((await get(path, root)).status).toBe(200);
    },
  );
  it("requires authentication", async () => {
    expect((await request(app.getHttpServer()).get("/api/v1/admin/stops")).status).toBe(401);
  });
  it.each([
    ["post", "stops", stopBody],
    ["post", "routes", routeBody],
    ["patch", "stops/" + stop1, { nameEn: "New" }],
    ["patch", "routes/" + routeId, { nameEn: "New" }],
    [
      "post",
      "timetables",
      {
        routeId,
        busTypeId,
        departureLocal: "10:00",
        daysMask: 127,
        validFrom: new Date().toISOString(),
      },
    ],
    ["patch", "timetables/timetabletest1", { departureLocal: "10:30" }],
    ["delete", "timetables/timetabletest1", {}],
    ["post", "trips/generate", { from: "2026-10-06", to: "2026-10-06" }],
    ["post", "users/citizentest01/roles", { role: "DEPOT_STAFF", depotId }],
    [
      "put",
      "fare-rules",
      {
        busTypeId,
        baseFarePaise: 0,
        perKmPaise: 150,
        minFarePaise: 0,
        reservationFeePaise: 500,
        validFrom: new Date().toISOString(),
      },
    ],
    [
      "put",
      "refund-policies",
      {
        name: "New",
        tiers: [
          { minHoursBefore: 1, percent: 60 },
          { minHoursBefore: 0, percent: 0 },
        ],
        cancellationFeePaise: 0,
        validFrom: new Date().toISOString(),
      },
    ],
    ["put", "settings", { "booking.holdMinutes": 15 }],
  ] as const)("blocks depot mutations: %s %s", async (method, path, body) => {
    expect((await write(method, path, body, manager)).status).toBe(403);
  });
  it("validates bilingual names, AP coordinates and district references", async () => {
    expect((await write("post", "stops", { ...stopBody, nameTe: "" })).status).toBe(400);
    expect((await write("post", "stops", { ...stopBody, lat: 5 })).status).toBe(400);
    expect(
      (await write("post", "stops", { ...stopBody, districtId: "missingdistrict" })).status,
    ).toBe(400);
    expect((await write("post", "stops", stopBody)).status).toBe(201);
    expect(tables.auditLog![0]).toMatchObject({
      action: "network.update",
      entityType: "stop",
      before: expect.anything(),
      after: expect.objectContaining({ code: "TST4" }),
    });
  });
  it("validates ordered route stops and regenerates geometry", async () => {
    expect(
      (
        await write("post", "routes", {
          ...routeBody,
          stops: [routeBody.stops[0], { ...routeBody.stops[1], kmFromOrigin: 0 }],
        })
      ).status,
    ).toBe(400);
    const result = await write("post", "routes", routeBody);
    expect(result.status, result.text).toBe(201);
    expect(decodePolyline(result.body.polyline)).toEqual([
      [15.8, 78],
      [16, 78.2],
    ]);
    expect(result.body.stops).toHaveLength(2);
  });
  it("refuses removing stops used by future active tickets and rolls back", async () => {
    tables.ticket!.push({
      id: "tickettest0001",
      routeId,
      tripId,
      status: "ACTIVE",
      boardingStopId: stop2,
      droppingStopId: stop3,
    });
    const result = await write("patch", "routes/" + routeId, {
      stops: [routeBody.stops[0], { ...routeBody.stops[1], stopId: stop3, kmFromOrigin: 40 }],
    });
    expect(result.status, result.text).toBe(400);
    expect(tables.routeStop).toHaveLength(3);
    expect(tables.auditLog).toHaveLength(0);
  });
  it("updates and deactivates timetables with snapshots", async () => {
    const r = await write("patch", "timetables/timetabletest1", { departureLocal: "10:00" });
    expect(r.status, r.text).toBe(200);
    expect((await write("delete", "timetables/timetabletest1")).status).toBe(200);
    expect(tables.timetable![0]!.isActive).toBe(false);
    expect(tables.auditLog!.every((a) => a.before && a.after)).toBe(true);
  });
  it("generates idempotently and returns actual inserted count", async () => {
    const from = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const first = await write("post", "trips/generate", { from, to: from });
    expect(first.status, first.text).toBe(201);
    expect(first.body.count).toBe(1);
    expect((await write("post", "trips/generate", { from, to: from })).body.count).toBe(0);
  });
  it("rolls back generated trips when the audit write fails", async () => {
    const from = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const before = tables.trip!.map((trip) => trip.code);
    const audit = vi.spyOn(app.get(AdminService) as any, "audit")
      .mockRejectedValueOnce(new Error("Audit unavailable"));
    try {
      expect((await write("post", "trips/generate", { from, to: from })).status).toBe(500);
      expect(tables.trip!.map((trip) => trip.code)).toEqual(before);
      expect(tables.auditLog).toHaveLength(0);
    } finally {
      audit.mockRestore();
    }
    expect((await write("post", "trips/generate", { from, to: from })).body.count).toBe(1);
    expect(tables.auditLog).toHaveLength(1);
  });
  it("limits admin grants and revokes to super admin, validates scope and protects last role", async () => {
    expect((await write("post", "users/citizentest01/roles", { role: "STATE_ADMIN", stateId })).status).toBe(
      403,
    );
    expect((await write("post", "users/citizentest01/roles", { role: "DRIVER" })).status).toBe(400);
    // D-034: state roles need a state, and a state admin grants only inside their own state
    expect((await write("post", "users/citizentest01/roles", { role: "STATE_ADMIN" }, root)).status).toBe(400);
    expect((await write("post", "users/citizentest01/roles", { role: "TRANSPORT_OFFICER", stateId: otherStateId })).status).toBe(403);
    const officer = await write("post", "users/citizentest01/roles", { role: "TRANSPORT_OFFICER", stateId });
    expect(officer.status, officer.text).toBe(201);
    expect(officer.body.stateId).toBe(stateId);
    tables.userRole = tables.userRole!.filter((x) => x.id !== officer.body.id);
    tables.auditLog = [];
    const r = await write("post", "users/citizentest01/roles", { role: "STATE_ADMIN", stateId }, root);
    expect(r.status, r.text).toBe(201);
    expect((await write("delete", "users/citizentest01/roles/" + r.body.id)).status).toBe(403);
    expect((await write("delete", "users/citizentest01/roles/" + r.body.id, {}, root)).status).toBe(
      200,
    );
    expect(
      (await write("delete", "users/roottest00001/roles/rootroletest01", {}, root)).status,
    ).toBe(403);
    expect(tables.auditLog!.map((a) => a.action)).toEqual(["role.grant", "role.revoke"]);
  });
  it("adds fare history and never modifies the previous row", async () => {
    const old = { ...tables.fareRule![0] },
      validFrom = new Date(Date.now() + 86400000).toISOString();
    expect(
      (
        await write("put", "fare-rules", {
          busTypeId,
          baseFarePaise: 0,
          perKmPaise: 150,
          minFarePaise: 0,
          reservationFeePaise: 500,
          validFrom,
        })
      ).status,
    ).toBe(200);
    expect(tables.fareRule![0]).toEqual(old);
    expect(tables.fareRule).toHaveLength(2);
    expect(tables.auditLog![0]!.action).toBe("policy.update");
  });
  it("validates refund tiers and retains the effective old policy until validFrom", async () => {
    const body = {
      name: "Tomorrow",
      tiers: [
        { minHoursBefore: 24, percent: 80 },
        { minHoursBefore: 1, percent: 40 },
        { minHoursBefore: 0, percent: 0 },
      ],
      validFrom: new Date(Date.now() + 86400000).toISOString(),
      cancellationFeePaise: 0,
    };
    expect(
      (
        await write("put", "refund-policies", {
          ...body,
          tiers: [
            { minHoursBefore: 1, percent: 100 },
            { minHoursBefore: 24, percent: 110 },
          ],
        })
      ).status,
    ).toBe(400);
    expect((await write("put", "refund-policies", body)).status).toBe(200);
    expect(tables.refundPolicy!.filter((p) => p.isActive)).toHaveLength(1);
    expect(
      (
        await prisma.refundPolicy.findFirst({
          where: { validFrom: { lte: new Date() } },
          orderBy: { validFrom: "desc" },
        })
      ).name,
    ).toBe("Current");
  });
  it("rejects unknown settings and immutable QR parameters, audits each accepted key", async () => {
    expect((await write("put", "settings", { "unknown.key": 2 })).status).toBe(400);
    expect((await write("put", "settings", { "qr.windowSteps": 10 })).status).toBe(400);
    expect(
      (await write("put", "settings", { "booking.holdMinutes": 15, "booking.maxPassengers": 5 }))
        .status,
    ).toBe(200);
    expect(tables.auditLog!.map((a) => a.action)).toEqual(["settings.update", "settings.update"]);
  });
  it("returns paginated audit snapshots and scopes managerial reads", async () => {
    for (let i = 0; i < 3; i++) await write("patch", "stops/" + stop1, { nameEn: "Name " + i });
    const first = await get("audit-logs?limit=2");
    expect(first.status, first.text).toBe(200);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.items[0].before.nameEn).toBeTruthy();
    const second = await get("audit-logs?limit=2&cursor=" + first.body.nextCursor);
    expect(second.body.items).toHaveLength(1);
    expect((await get("audit-logs", manager)).body.items).toHaveLength(0);
    tables.auditLog!.push(
      { id: "auditown00001", action: "bus.create", entityType: "bus", entityId: "busown000001", actorUserId: "usermulti001", actorRole: "STATE_ADMIN", before: null, after: { depotId }, createdAt: new Date() },
      { id: "auditother001", action: "bus.create", entityType: "bus", entityId: "busother0001", actorUserId: "usermulti001", actorRole: "STATE_ADMIN", before: null, after: { depotId: "otherdepot001" }, createdAt: new Date() },
    );
    const scoped = await get("audit-logs", manager);
    expect(scoped.body.items.map((row: { id: string }) => row.id)).toEqual(["auditown00001"]);
    expect((await get("audit-logs", citizen)).status).toBe(403);
  });
});
