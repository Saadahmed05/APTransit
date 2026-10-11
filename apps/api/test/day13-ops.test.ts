/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AddressInfo } from "node:net";
import { io, type Socket } from "socket.io-client";
import { createHmac } from "node:crypto";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { getQueueToken } from "@nestjs/bullmq";
import request from "supertest";
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest";
import { formatIstDate } from "@aptransit/shared";
import { LiveGateway } from "../src/modules/tracking/live.gateway";
import { OpsService } from "../src/modules/ops/ops.service";
import { AppModule } from "../src/app.module";
import { configureHttpApp } from "../src/http-app";
import { AuthService } from "../src/modules/auth/auth.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { RedisService } from "../src/redis/redis.service";
import { QUEUES } from "../src/modules/queue/queue.constants";
import { PAYMENT_PROVIDER } from "../src/modules/payments/payment-provider";
import { FakePaymentProvider } from "../src/modules/payments/fake-payment.provider";
import { createMemoryPrisma, type Tables } from "./memory-prisma";
import { createFakeRedis } from "./fake-redis";
const tables: Tables = {},
  by = (model: string, id: unknown) => (tables[model] ?? []).find((r) => r.id === id) ?? null;
/** Every test depot is in AP (D-034): the district row carries the state for room names. */
const depot = (id: unknown) => {
  const row = by("depot", id);
  return row && { ...row, district: by("district", row.districtId) ?? { id: row.districtId, stateId: "stateap0000001" } };
};
const assignment = (a: any) => ({
  ...a,
  bus: by("bus", a.busId),
  driver: { ...by("driver", a.driverId), user: by("user", by("driver", a.driverId)?.userId) },
  conductor: a.conductorId
    ? {
        ...by("conductor", a.conductorId),
        user: by("user", by("conductor", a.conductorId)?.userId),
      }
    : null,
});
const tripRef = (t: any) => ({
  ...t,
  route: { ...by("route", t.routeId), depot: depot(by("route", t.routeId)?.depotId) },
});
const prisma = createMemoryPrisma(
  tables,
  {
    bus: {
      depot: (b) => depot(b.depotId),
      busType: (b) => by("busType", b.busTypeId),
      maintenanceRecords: (b) => (tables.maintenanceRecord ?? []).filter((m) => m.busId === b.id),
      tripAssignments: (b) =>
        (tables.tripAssignment ?? [])
          .filter((a) => a.busId === b.id)
          .map((a) => ({ ...a, trip: tripRef(by("trip", a.tripId)) })),
    },
    trip: {
      route: (t) => tripRef(t).route,
      assignments: (t) =>
        (tables.tripAssignment ?? []).filter((a) => a.tripId === t.id).map(assignment),
      tickets: (t) => (tables.ticket ?? []).filter((x) => x.tripId === t.id),
      incidents: (t) => (tables.incident ?? []).filter((i) => i.tripId === t.id),
    },
    tripAssignment: { trip: (a) => tripRef(by("trip", a.tripId)) },
    driver: { depot: (d) => depot(d.depotId), user: (d) => by("user", d.userId) },
    conductor: { depot: (c) => depot(c.depotId), user: (c) => by("user", c.userId) },
    device: {
      user: (d) => ({
        ...by("user", d.userId),
        driver: {
          ...tables.driver!.find((r) => r.userId === d.userId),
          depot: depot(tables.driver!.find((r) => r.userId === d.userId)?.depotId),
        },
      }),
    },
    incident: { trip: (i) => tripRef(by("trip", i.tripId)) },
    payment: { refunds: (p) => (tables.refund ?? []).filter((r) => r.paymentId === p.id) },
    user: { driver: (u) => tables.driver!.find((d) => d.userId === u.id) },
  },
  {
    tripAssignment: { endedAt: null },
    refund: { providerRefundId: null, processedAt: null },
    notification: { link: null, readAt: null },
    user: { deletedAt: null, preferredLocale: "en" },
  },
);
const redis = createFakeRedis(),
  provider = new FakePaymentProvider();
const ids = {
  depot: "depotknl000001",
  other: "depotndl000001",
  trip: "tripops0000001",
  bus: "busops00000001",
  replacement: "busops00000002",
  driver: "driverops00001",
  secondDriver: "driverops00002",
  conductor: "conductorops01",
  incident: "incidentops001",
  device: "deviceops00001",
};
describe("Day 13 operations HTTP", () => {
  let app: NestExpressApplication,
    manager: string,
    staff: string,
    citizen: string,
    district: string;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(RedisService)
      .useValue(redis)
      .overrideProvider(PAYMENT_PROVIDER)
      .useValue(provider)
      .overrideProvider(getQueueToken(QUEUES.NOTIFICATIONS))
      .useValue({ add: async () => ({}) })
      .overrideProvider(getQueueToken(QUEUES.EXPIRY))
      .useValue({ add: async () => ({}) })
      .compile();
    app = module.createNestApplication({ logger: false, rawBody: true });
    configureHttpApp(app);
    await app.listen(0, "127.0.0.1");
    const auth = module.get(AuthService) as any;
    manager = await auth.generateAccessToken("managerops0001", [
      { role: "DEPOT_MANAGER", depotId: ids.depot },
    ]);
    staff = await auth.generateAccessToken("staffops000001", [
      { role: "DEPOT_STAFF", depotId: ids.depot },
    ]);
    citizen = await auth.generateAccessToken("citizenops0001", [{ role: "CITIZEN" }]);
    district = await auth.generateAccessToken("districtoff001", [
      { role: "DISTRICT_OFFICER", districtId: "districtknl001" },
    ]);
  });
  afterAll(() => app.close());
  beforeEach(() => {
    Object.keys(tables).forEach((k) => delete tables[k]);
    provider.refunds.length = 0;
    const now = new Date(),
      layout = {
        rows: 2,
        columns: 3,
        aisleIndex: 1,
        labels: ["1", "2", "3", "4"],
        blockedCells: [],
      };
    Object.assign(tables, {
      depot: [
        { id: ids.depot, districtId: "districtknl001" },
        { id: ids.other, districtId: "districtndl001" },
      ],
      route: [
        {
          id: "routeops000001",
          depotId: ids.depot,
          nameEn: "Kurnool to Nandyal",
          nameTe: "కర్నూలు నుండి నంద్యాల",
        },
      ],
      busType: [
        { id: "bustypeops0001", serviceType: "EXPRESS", totalSeats: 4, seatLayout: layout },
        {
          id: "bustypesmall01",
          serviceType: "SUPER_LUXURY",
          totalSeats: 2,
          seatLayout: { ...layout, labels: ["1", "2"] },
        },
      ],
      bus: [
        {
          id: ids.bus,
          regNo: "AP 39 Z 1001",
          busTypeId: "bustypeops0001",
          depotId: ids.depot,
          status: "BREAKDOWN",
          maintenanceDueAt: null,
          odometerKm: 0,
        },
        {
          id: ids.replacement,
          regNo: "AP 39 Z 1002",
          busTypeId: "bustypeops0001",
          depotId: ids.depot,
          status: "IDLE",
          maintenanceDueAt: null,
          odometerKm: 0,
        },
        {
          id: "busother000001",
          regNo: "AP 39 Z 9001",
          busTypeId: "bustypeops0001",
          depotId: ids.other,
          status: "IDLE",
          maintenanceDueAt: null,
          odometerKm: 0,
        },
      ],
      driver: [
        {
          id: ids.driver,
          userId: "driveruser0001",
          depotId: ids.depot,
          licenseNo: "LIC-1",
          employeeCode: "DRV1",
        },
        {
          id: ids.secondDriver,
          userId: "driveruser0002",
          depotId: ids.depot,
          licenseNo: "LIC-2",
          employeeCode: "DRV2",
        },
      ],
      conductor: [
        { id: ids.conductor, userId: "conductoruser1", depotId: ids.depot, employeeCode: "CON1" },
      ],
      user: [
        { id: "driveruser0001", name: "Driver one", email: null },
        { id: "driveruser0002", name: "Driver two", email: null },
        { id: "conductoruser1", name: "Conductor", email: null },
        { id: "citizenops0001", name: "Citizen", email: null },
        { id: "citizenops0002", name: "Citizen two", email: null },
      ],
      trip: [
        {
          id: ids.trip,
          code: "TRP-OPS",
          routeId: "routeops000001",
          busTypeId: "bustypeops0001",
          serviceDate: new Date(formatIstDate(now) + "T00:00:00Z"),
          scheduledDepartureAt: new Date(+now - 600000),
          scheduledArrivalAt: new Date(+now + 3600000),
          actualDepartureAt: new Date(+now - 600000),
          actualArrivalAt: null,
          status: "RUNNING",
          delayMinutes: 0,
          lastStopSeq: 1,
          hasOpenIncident: true,
        },
      ],
      tripAssignment: [
        {
          id: "assignmentops1",
          tripId: ids.trip,
          busId: ids.bus,
          driverId: ids.driver,
          conductorId: ids.conductor,
          reason: "INITIAL",
          assignedById: "managerops0001",
          startedAt: new Date(+now - 600000),
          endedAt: null,
        },
      ],
      ticket: [
        {
          id: "ticketops00001",
          tripId: ids.trip,
          holderUserId: "citizenops0001",
          seatNo: "3",
          status: "BOOKED",
          farePaise: 10500,
          bookingId: "bookingops001",
          version: 1,
        },
        {
          id: "ticketops00002",
          tripId: ids.trip,
          holderUserId: "citizenops0002",
          seatNo: "4",
          status: "ACTIVE",
          farePaise: 10500,
          bookingId: "bookingops001",
          version: 1,
        },
        {
          id: "ticketops00003",
          tripId: ids.trip,
          holderUserId: "citizenops0001",
          seatNo: "1",
          status: "BOOKED",
          farePaise: 0,
          bookingId: null,
          version: 1,
        },
      ],
      payment: [
        {
          id: "paymentops001",
          bookingId: "bookingops001",
          providerPaymentId: "pay_ops",
          status: "CAPTURED",
          amountPaise: 21000,
          capturedAt: now,
        },
      ],
      refundPolicy: [{ id: "policyops0001", isActive: true, validFrom: now }],
      incident: [
        {
          id: ids.incident,
          code: "INC-TEST01",
          tripId: ids.trip,
          busId: ids.bus,
          type: "BREAKDOWN",
          severity: "HIGH",
          status: "OPEN",
          lat: 15.8,
          lng: 78,
          note: null,
          createdAt: now,
        },
      ],
      device: [
        {
          id: ids.device,
          userId: "driveruser0001",
          label: "Test phone",
          approvedAt: null,
          approvedById: null,
          revokedAt: null,
          deviceKeyHash: "never-expose",
        },
      ],
      maintenanceRecord: [],
      refund: [],
      notification: [],
      auditLog: [],
      userRole: [],
    });
  });
  const get = (path: string, token = manager) =>
    request(app.getHttpServer())
      .get("/api/v1/ops/" + path)
      .auth(token, { type: "bearer" });
  const post = (path: string, body: Record<string, unknown> = {}, token = manager) =>
    request(app.getHttpServer())
      .post("/api/v1/ops/" + path)
      .auth(token, { type: "bearer" })
      .send(body);
  it("updates two depot dashboards when either acknowledges an incident", async () => {
    const url="http://127.0.0.1:"+(app.getHttpServer().address() as AddressInfo).port;
    const sockets:Socket[]=[];
    const connect=()=>new Promise<Socket>((resolve,reject)=>{const socket=io(url+"/live",{auth:{token:manager},transports:["websocket"],forceNew:true});sockets.push(socket);socket.once("connect",()=>resolve(socket));socket.once("connect_error",reject);});
    try {
      const clients=await Promise.all([connect(),connect()]);
      for(const socket of clients)expect(await socket.emitWithAck("subscribe",{room:"depot:"+ids.depot})).toEqual({ok:true});
      const updates=clients.map(socket=>new Promise<any>((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error("Incident event missing")),3000);socket.once("incident:update",payload=>{clearTimeout(timeout);resolve(payload);});}));
      expect((await post("incidents/"+ids.incident+"/acknowledge")).status).toBe(201);
      const results=await Promise.all(updates);
      expect(results.map(r=>r.status)).toEqual(["ACKNOWLEDGED","ACKNOWLEDGED"]);
    } finally {sockets.forEach(socket=>socket.disconnect());}
  });
  it("only computes KPIs for rooms with listeners", async () => {
    const gateway = app.get(LiveGateway),
      ops = app.get(OpsService);
    const original = gateway.server,
      spy = vi.spyOn(ops, "dashboard");
    const rooms = new Map<string, Set<string>>(),
      emitted: string[] = [];
    gateway.server = {
      adapter: { rooms },
      to: (names: string[]) => ({ emit: () => emitted.push(...names) }),
    } as any;
    try {
      await gateway.pushKpis();
      expect(spy).not.toHaveBeenCalled();
      rooms.set("depot:" + ids.depot, new Set(["listener"]));
      rooms.set("depot:" + ids.other, new Set());
      rooms.set("trip:" + ids.trip, new Set(["public"]));
      await gateway.pushKpis();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(emitted).toEqual(["depot:" + ids.depot]);
    } finally {
      spy.mockRestore();
      gateway.server = original;
    }
  });
  it("rejects malformed status filters", async () => {
    expect((await get("buses?status=unknown")).status).toBe(400);
    expect((await get("trips?status=unknown")).status).toBe(400);
    expect((await get("incidents?status=unknown")).status).toBe(400);
  });
  it("requires authentication and permissions", async () => {
    expect((await request(app.getHttpServer()).get("/api/v1/ops/buses")).status).toBe(401);
    expect((await get("buses", citizen)).status).toBe(403);
    expect((await post("trips/" + ids.trip + "/cancel", { reason: "Test" }, staff)).status).toBe(
      403,
    );
  });
  it("makes real operations audits visible only to the entity's depot and district", async () => {
    const created = await post("buses", {
      regNo: "AP 39 Z 2000",
      depotId: ids.depot,
      busTypeId: "bustypeops0001",
    });
    expect(created.status, created.text).toBe(201);
    expect((await post("incidents/" + ids.incident + "/acknowledge")).status).toBe(201);
    const audit = (token: string) => request(app.getHttpServer())
      .get("/api/v1/admin/audit-logs")
      .auth(token, { type: "bearer" });
    for (const token of [manager, district]) {
      const result = await audit(token);
      expect(result.status, result.text).toBe(200);
      expect(result.body.items.map((row: { action: string }) => row.action).sort())
        .toEqual(["fleet.create", "incident.acknowledge"]);
    }
    const other = await (app.get(AuthService) as any).generateAccessToken("othermanager01", [
      { role: "DEPOT_MANAGER", depotId: ids.other },
    ]);
    expect((await audit(other)).body.items).toEqual([]);
  });
  it("blocks cross-depot reads and writes, including district scope", async () => {
    expect((await get("buses?depotId=" + ids.other)).status).toBe(403);
    expect((await get("buses/busother000001")).status).toBe(403);
    expect(
      (
        await post("buses", {
          regNo: "AP 39 Z 2000",
          depotId: ids.other,
          busTypeId: "bustypeops0001",
        })
      ).status,
    ).toBe(403);
    expect((await get("buses?depotId=" + ids.depot, district)).status).toBe(200);
    expect((await get("buses?depotId=" + ids.other, district)).status).toBe(403);
  });
  it("does not borrow a lower-permission role's scope for a sensitive write", async () => {
    const auth = app.get(AuthService) as any,
      token = await auth.generateAccessToken("multiops00001", [
        { role: "DEPOT_MANAGER", depotId: ids.other },
        { role: "DEPOT_STAFF", depotId: ids.depot },
      ]);
    expect((await post("devices/" + ids.device + "/approve", {}, token)).status).toBe(403);
  });
  it("replaces after breakdown, keeps tickets and notifies each holder once", async () => {
    expect((await post("incidents/" + ids.incident + "/acknowledge")).status).toBe(201);
    expect(tables.incident![0]!.acknowledgedAt).toBeInstanceOf(Date);
    const res = await post("trips/" + ids.trip + "/replace-bus", {
      busId: ids.replacement,
      driverId: ids.secondDriver,
      reason: "Breakdown",
    });
    expect(res.status, res.text).toBe(201);
    expect(tables.tripAssignment).toHaveLength(2);
    expect(tables.tripAssignment![0]!.endedAt).toBeInstanceOf(Date);
    expect(tables.tripAssignment![1]!.reason).toBe("REPLACEMENT");
    expect(tables.ticket!.map((t) => [t.tripId, t.seatNo])).toEqual([
      [ids.trip, "3"],
      [ids.trip, "4"],
      [ids.trip, "1"],
    ]);
    expect(tables.notification!.filter((n) => n.type === "REPLACEMENT_BUS")).toHaveLength(2);
    expect(tables.bus![0]!.status).toBe("BREAKDOWN");
    expect(tables.bus![1]!.status).toBe("RUNNING");
    expect(tables.auditLog!.some((a) => a.action === "trip.replace_bus")).toBe(true);
  });
  it("rejects smaller or busy replacement buses without changing assignments", async () => {
    tables.bus![1]!.busTypeId = "bustypesmall01";
    expect(
      (await post("trips/" + ids.trip + "/replace-bus", { busId: ids.replacement, reason: "Test" }))
        .status,
    ).toBe(409);
    expect(tables.tripAssignment).toHaveLength(1);
    expect(tables.tripAssignment![0]!.endedAt).toBeNull();
    tables.bus![1]!.busTypeId = "bustypeops0001";
    tables.bus![1]!.status = "RUNNING";
    expect(
      (await post("trips/" + ids.trip + "/replace-bus", { busId: ids.replacement, reason: "Test" }))
        .status,
    ).toBe(409);
  });
  it("still refunds a ticket activated while cancellation waits for its lock", async () => {
    const update = prisma.ticket.updateMany.bind(prisma.ticket);
    const spy = vi.spyOn(prisma.ticket, "updateMany").mockImplementationOnce(async (args) => {
      tables.ticket![0]!.status = "ACTIVE";
      tables.ticket![0]!.version += 1;
      return update(args);
    });
    try {
      const res = await post("trips/" + ids.trip + "/cancel", { reason: "Operator cancellation" });
      expect(res.status, res.text).toBe(201);
      expect(provider.refunds.map((r) => r.amountPaise)).toEqual([10500, 10500]);
    } finally {
      spy.mockRestore();
    }
  });
  it("cancels and refunds full fare including fees, leaves paid status until webhook", async () => {
    const res = await post("trips/" + ids.trip + "/cancel", { reason: "Service cancelled" });
    expect(res.status, res.text).toBe(201);
    expect(provider.refunds.map((r) => r.amountPaise)).toEqual([10500, 10500]);
    expect(tables.ticket!.map((t) => t.status)).toEqual(["BOOKED", "ACTIVE", "REFUNDED"]);
    expect(tables.notification!.filter((n) => n.type === "TRIP_CANCELLED")).toHaveLength(2);
    expect((await post("trips/" + ids.trip + "/cancel", { reason: "Repeat" })).status).toBe(201);
    expect(provider.refunds).toHaveLength(2);
    for (const refund of provider.refunds) {
      const body = JSON.stringify({
        event: "refund.processed",
        payload: {
          refund: {
            entity: { id: refund.id, payment_id: refund.paymentId, amount: refund.amountPaise },
          },
        },
      });
      const signature = createHmac("sha256", provider.webhookSecret).update(body).digest("hex");
      for (let retry = 0; retry < 2; retry++) {
        await request(app.getHttpServer())
          .post("/api/v1/payments/webhook")
          .set("Content-Type", "application/json")
          .set("x-razorpay-signature", signature)
          .send(body)
          .expect(200);
      }
    }
    expect(tables.ticket!.map((t) => t.status)).toEqual(["REFUNDED", "REFUNDED", "REFUNDED"]);
    expect(tables.payment![0]!.status).toBe("REFUNDED");
  });
  it("approves and revokes devices without exposing key hashes", async () => {
    const res = await post("devices/" + ids.device + "/approve");
    expect(res.status, res.text).toBe(201);
    expect(res.body.approvedAt).toBeTruthy();
    expect(res.body.deviceKeyHash).toBeUndefined();
    expect((await post("devices/" + ids.device + "/revoke")).body.revokedAt).toBeTruthy();
    expect((await post("devices/" + ids.device + "/approve")).status).toBe(403);
  });
  it("only clears incident flags when all incidents resolve, restores replaced old bus to idle", async () => {
    tables.incident!.push({ ...tables.incident![0], id: "incidentops002", type: "TRAFFIC" });
    expect((await post("incidents/" + ids.incident + "/resolve", { note: "Fixed" })).status).toBe(
      201,
    );
    expect(tables.trip![0]!.hasOpenIncident).toBe(true);
    expect(tables.bus![0]!.status).toBe("RUNNING");
    expect(
      (await post("incidents/incidentops002/resolve", { note: "Traffic cleared" })).status,
    ).toBe(201);
    expect(tables.trip![0]!.hasOpenIncident).toBe(false);
  });
  it("excludes assigned and maintenance buses from available results", async () => {
    expect((await get("buses/available")).body.map((b: any) => b.id)).toEqual([ids.replacement]);
    const m = await post("buses/" + ids.replacement + "/maintenance", {
      kind: "Service",
      startAt: new Date().toISOString(),
    });
    expect(m.status, m.text).toBe(201);
    expect(tables.bus![1]!.status).toBe("MAINTENANCE");
    expect((await get("buses/available")).body).toHaveLength(0);
  });
  it("rejects overlapping staff and bus assignments", async () => {
    const other = {
      ...tables.trip![0],
      id: "tripops0000002",
      code: "TRP-OPS2",
      status: "SCHEDULED",
    };
    tables.trip!.push(other);
    const res = await post("trips/" + other.id + "/assign", {
      busId: ids.replacement,
      driverId: ids.driver,
    });
    expect(res.status, res.text).toBe(409);
    expect(tables.tripAssignment).toHaveLength(1);
  });
});
