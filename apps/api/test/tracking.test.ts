/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AddressInfo } from "node:net";
import { encodePolyline, formatIstDate, LiveTripDto } from "@aptransit/shared";
import { getQueueToken } from "@nestjs/bullmq";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { io, type Socket } from "socket.io-client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureHttpApp } from "../src/http-app";
import { AuthService } from "../src/modules/auth/auth.service";
import { hashDeviceKey } from "../src/modules/driver/driver.service";
import { QUEUES } from "../src/modules/queue/queue.constants";
import { LiveGateway } from "../src/modules/tracking/live.gateway";
import { PrismaService } from "../src/prisma/prisma.service";
import { RedisService } from "../src/redis/redis.service";
import { createFakeRedis } from "./fake-redis";
import { createMemoryPrisma, type Tables } from "./memory-prisma";

// Day 11: driver endpoints, trusted GPS ingest, live state, sockets with room permissions, incidents.

const MIN = 60_000;
const DEVICE_KEY = "test_device_key_approved_000001";
const PENDING_KEY = "test_device_key_pending_0000001";
const ids = {
  driverUser: "userdriver00001",
  otherDriverUser: "userdriver00002",
  driver: "driverrow000001",
  otherDriver: "driverrow000002",
  trip: "tripknlvja00001",
  bus: "busknl000000001",
  route: "routeknlvja0001",
  depot: "depotknl0000001",
  otherDepot: "depotvja0000001",
  district: "districtknl0001",
  state: "stateap0000001",
  tgState: "statetg0000001",
};
const STOPS = [
  { id: "stopknl0000001", seq: 1, km: 0, min: 0, lat: 15.8281, lng: 78.0373, nameEn: "Kurnool" },
  { id: "stopndl0000001", seq: 2, km: 70, min: 75, lat: 15.4786, lng: 78.4836, nameEn: "Nandyal" },
  { id: "stopgdl0000001", seq: 3, km: 130, min: 145, lat: 15.3789, lng: 78.9265, nameEn: "Giddalur" },
];

function freshTables(departureInMin = 20): Tables {
  const now = Date.now();
  return {
    user: [
      { id: ids.driverUser, name: "Driver Srinivas", email: "driver.knl@aptransit.test" },
      { id: ids.otherDriverUser, name: "Other Driver", email: "other@aptransit.test" },
    ],
    driver: [
      { id: ids.driver, userId: ids.driverUser, depotId: ids.depot },
      { id: ids.otherDriver, userId: ids.otherDriverUser, depotId: ids.depot },
    ],
    device: [
      { id: "deviceok000001", userId: ids.driverUser, label: "Sim", deviceKeyHash: hashDeviceKey(DEVICE_KEY), approvedAt: new Date(now - 864e5), revokedAt: null },
      { id: "devicepend0001", userId: ids.driverUser, label: "New", deviceKeyHash: hashDeviceKey(PENDING_KEY), approvedAt: null, revokedAt: null },
    ],
    state: [
      { id: ids.state, code: "AP", minLng: 76.7, minLat: 12.6, maxLng: 84.8, maxLat: 19.95 },
      { id: ids.tgState, code: "TG", minLng: 77.23, minLat: 15.83, maxLng: 81.33, maxLat: 19.92 },
    ],
    district: [
      { id: ids.district, stateId: ids.state },
      { id: "districtntr0001", stateId: ids.state },
    ],
    depot: [
      { id: ids.depot, code: "D-KNL", districtId: ids.district },
      { id: ids.otherDepot, code: "D-VJA", districtId: "districtntr0001" },
    ],
    route: [{ id: ids.route, code: "KNL-VJA-01", nameEn: "Kurnool to Vijayawada", nameTe: "KNL VJA", distanceKm: 130, depotId: ids.depot, polyline: encodePolyline(STOPS.map((s) => [s.lat, s.lng])) }],
    routeStop: STOPS.map((s) => ({ routeId: ids.route, stopId: s.id, seq: s.seq, kmFromOrigin: s.km, minutesFromOrigin: s.min })),
    stop: STOPS.map((s) => ({ id: s.id, nameEn: s.nameEn, nameTe: `${s.nameEn} te`, lat: s.lat, lng: s.lng })),
    trip: [
      {
        id: ids.trip,
        code: "TRP-KNL-VJA-0001",
        routeId: ids.route,
        status: "SCHEDULED",
        serviceDate: new Date(`${formatIstDate(new Date(now))}T00:00:00.000Z`),
        scheduledDepartureAt: new Date(now + departureInMin * MIN),
        scheduledArrivalAt: new Date(now + (departureInMin + 145) * MIN),
        actualDepartureAt: null,
        actualArrivalAt: null,
        delayMinutes: 0,
        lastStopSeq: null,
        hasOpenIncident: false,
      },
    ],
    bus: [{ id: ids.bus, regNo: "AP 39 Z 1234", depotId: ids.depot, status: "IDLE" }],
    tripAssignment: [{ id: "assign00000001", tripId: ids.trip, busId: ids.bus, driverId: ids.driver, endedAt: null }],
    gpsLocation: [],
    incident: [],
    auditLog: [],
    setting: [],
  };
}

describe("Driver, tracking and sockets (Day 11)", () => {
  let app: NestExpressApplication;
  let url: string;
  let tokens: Record<string, string>;
  const tables: Tables = {};
  const redis = createFakeRedis();
  const sockets: Socket[] = [];

  const byId = (model: string, id: unknown) => (tables[model] ?? []).find((r) => r.id === id) ?? null;
  const prisma = createMemoryPrisma(tables, {
    trip: {
      route: (t) => {
        const route = byId("route", t.routeId);
        return (
          route && {
            ...route,
            depot: byId("depot", route.depotId),
            routeStops: tables.routeStop!.filter((rs) => rs.routeId === route.id).map((rs) => ({ ...rs, stop: byId("stop", rs.stopId) })),
          }
        );
      },
      assignments: (t) =>
        tables.tripAssignment!.filter((a) => a.tripId === t.id && a.endedAt === null).map((a) => ({ ...a, bus: byId("bus", a.busId), driver: byId("driver", a.driverId) })),
    },
    district: { state: (d) => byId("state", d.stateId) },
    depot: { district: (d) => byId("district", d.districtId) },
    tripAssignment: {
      driver: (a) => byId("driver", a.driverId),
      trip: (a) => {
        const trip = byId("trip", a.tripId);
        const route = trip && byId("route", trip.routeId);
        return trip && { ...trip, route: route && { ...route, depot: byId("depot", route.depotId) } };
      },
    },
  });

  const as = (who: string) => ({
    get: (path: string) => request(app.getHttpServer()).get(`/api/v1${path}`).set("Authorization", `Bearer ${tokens[who]}`),
    post: (path: string, body?: object, key?: string) => {
      const req = request(app.getHttpServer()).post(`/api/v1${path}`).set("Authorization", `Bearer ${tokens[who]}`);
      if (key) req.set("X-Device-Key", key);
      return req.send(body ?? {});
    },
  });
  const point = (lat: number, lng: number, extra: Record<string, unknown> = {}) => ({ lat, lng, speedKmh: 48, headingDeg: 120, accuracyM: 8, recordedAt: new Date().toISOString(), ...extra });
  const ping = (points: object[], key = DEVICE_KEY, who = "driver") => as(who).post("/tracking/ping", { tripId: ids.trip, points }, key);
  const startTrip = () => as("driver").post(`/driver/trips/${ids.trip}/start`).expect(200);
  const audits = (action: string) => tables.auditLog!.filter((a) => a.action === action);

  function connect(token?: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(`${url}/live`, { auth: token ? { token } : {}, transports: ["websocket"], forceNew: true });
      sockets.push(socket);
      socket.on("connect", () => resolve(socket));
      socket.on("connect_error", reject);
    });
  }
  const subscribe = (socket: Socket, room: string) => socket.emitWithAck("subscribe", { room });
  const next = <T>(socket: Socket, event: string) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no ${event} within 8 s`)), 8_000);
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(RedisService)
      .useValue(redis)
      .overrideProvider(getQueueToken(QUEUES.EXPIRY))
      .useValue({ add: async () => ({}), remove: async () => 1 })
      .overrideProvider(getQueueToken(QUEUES.NOTIFICATIONS))
      .useValue({ add: async () => ({}) })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureHttpApp(app);
    await app.listen(0, "127.0.0.1");
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    const auth = moduleRef.get(AuthService) as any;
    tokens = {
      driver: await auth.generateAccessToken(ids.driverUser, [{ role: "DRIVER", depotId: ids.depot, districtId: null }]),
      otherDriver: await auth.generateAccessToken(ids.otherDriverUser, [{ role: "DRIVER", depotId: ids.depot, districtId: null }]),
      citizen: await auth.generateAccessToken("usercitizen0001", [{ role: "CITIZEN", depotId: null, districtId: null }]),
      manager: await auth.generateAccessToken("usermanager0001", [{ role: "DEPOT_MANAGER", depotId: ids.depot, districtId: null }]),
      otherManager: await auth.generateAccessToken("usermanager0002", [{ role: "DEPOT_MANAGER", depotId: ids.otherDepot, districtId: null }]),
      districtOfficer: await auth.generateAccessToken("userdistrict001", [{ role: "DISTRICT_OFFICER", depotId: null, districtId: ids.district }]),
      transport: await auth.generateAccessToken("usertransport01", [{ role: "TRANSPORT_OFFICER", depotId: null, districtId: null, stateId: ids.state }]),
      tgTransport: await auth.generateAccessToken("usertransport02", [{ role: "TRANSPORT_OFFICER", depotId: null, districtId: null, stateId: ids.tgState }]),
      root: await auth.generateAccessToken("usersuperadmin1", [{ role: "SUPER_ADMIN", depotId: null, districtId: null }]),
    };
  });

  beforeEach(() => {
    for (const key of Object.keys(tables)) delete tables[key];
    Object.assign(tables, freshTables());
    redis.store.clear();
    // Each test may emit at once: reset the per trip throttle
    const gateway = app.get(LiveGateway) as any;
    gateway.lastPosition.clear();
    gateway.lastStatePosition.clear();
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await app.close();
  });

  describe("driver endpoints", () => {
    it("registers a device: the key is returned once and stored hashed, pending approval", async () => {
      const res = await as("driver").post("/driver/devices", { label: "Samsung A14" }).expect(201);
      expect(res.body.deviceKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const row = tables.device!.find((d) => d.id === res.body.deviceId)!;
      expect(row).toMatchObject({ label: "Samsung A14", deviceKeyHash: hashDeviceKey(res.body.deviceKey) });
      expect(row.approvedAt ?? null).toBeNull();
      expect(JSON.stringify(row)).not.toContain(res.body.deviceKey);
      expect(audits("device.register")).toHaveLength(1);
    });

    it("today shows the assigned trip with bus, route, ordered stops and device state", async () => {
      const res = await as("driver").get("/driver/today").set("X-Device-Key", PENDING_KEY).expect(200);
      expect(res.body).toMatchObject({
        driverName: "Driver Srinivas",
        trip: { id: ids.trip, status: "SCHEDULED" },
        bus: { regNo: "AP 39 Z 1234" },
        route: { code: "KNL-VJA-01" },
        deviceRegistered: true,
        deviceApproved: true,
        thisDevice: "PENDING",
      });
      expect(res.body.stops.map((s: any) => s.seq)).toEqual([1, 2, 3]);
      await as("citizen").get("/driver/today").expect(403);
    });

    it("start: only the assigned driver, an approved device, inside 60 min of departure", async () => {
      expect((await as("otherDriver").post(`/driver/trips/${ids.trip}/start`).expect(403)).body.error.code).toBe("TRIP_NOT_ASSIGNED");

      Object.assign(tables, freshTables(90));
      expect((await as("driver").post(`/driver/trips/${ids.trip}/start`).expect(409)).body.error.code).toBe("TRIP_NOT_STARTABLE");

      Object.assign(tables, freshTables(20));
      tables.device = tables.device!.filter((d) => d.approvedAt === null);
      expect((await as("driver").post(`/driver/trips/${ids.trip}/start`).expect(403)).body.error.code).toBe("DEVICE_NOT_APPROVED");

      Object.assign(tables, freshTables(20));
      const res = await startTrip();
      expect(res.body).toMatchObject({ status: "RUNNING", displayStatus: "RUNNING" });
      expect(tables.trip![0]!.actualDepartureAt).toBeInstanceOf(Date);
      expect(tables.bus![0]!.status).toBe("RUNNING");
      expect(JSON.parse(redis.store.get(`depot:live:${ids.depot}`)!)).toEqual([ids.trip]);
      expect(audits("trip.start")).toHaveLength(1);
      expect((await as("driver").post(`/driver/trips/${ids.trip}/start`).expect(409)).body.error.code).toBe("TRIP_NOT_STARTABLE");
    });

    it("end: RUNNING to COMPLETED, removed from the live set, audited", async () => {
      expect((await as("driver").post(`/driver/trips/${ids.trip}/end`).expect(409)).body.error.code).toBe("TRIP_NOT_STARTABLE");
      await startTrip();
      const res = await as("driver").post(`/driver/trips/${ids.trip}/end`).expect(200);
      expect(res.body.status).toBe("COMPLETED");
      expect(tables.trip![0]!.actualArrivalAt).toBeInstanceOf(Date);
      expect(tables.bus![0]!.status).toBe("IDLE");
      expect(JSON.parse(redis.store.get(`depot:live:${ids.depot}`)!)).toEqual([]);
      expect(audits("trip.end")).toHaveLength(1);
    });
  });

  describe("POST /tracking/ping trust checks", () => {
    const near = () => point(15.6, 78.3);

    it("rejects an unapproved device and a missing key", async () => {
      await startTrip();
      expect((await ping([near()], PENDING_KEY).expect(403)).body.error.code).toBe("DEVICE_NOT_APPROVED");
      expect((await ping([near()], "").expect(403)).body.error.code).toBe("DEVICE_NOT_APPROVED");
    });

    it("rejects the wrong driver (even with a valid key of someone else)", async () => {
      await startTrip();
      expect((await ping([near()], DEVICE_KEY, "otherDriver").expect(403)).body.error.code).toBe("DEVICE_NOT_APPROVED");
      tables.device!.push({ id: "deviceother001", userId: ids.otherDriverUser, label: "x", deviceKeyHash: hashDeviceKey("other_driver_key_0000000001"), approvedAt: new Date(), revokedAt: null });
      expect((await ping([near()], "other_driver_key_0000000001", "otherDriver").expect(403)).body.error.code).toBe("TRIP_NOT_ASSIGNED");
    });

    it("rejects a trip that is not running", async () => {
      expect((await ping([near()]).expect(409)).body.error.code).toBe("TRIP_NOT_STARTABLE");
    });

    it("rejects an out of bounds point, a too fast point and a stale point, and counts them", async () => {
      await startTrip();
      expect((await ping([point(28.6, 77.2)]).expect(400)).body.error.details.reason).toBe("OUT_OF_BOUNDS");
      expect((await ping([point(15.6, 78.3, { speedKmh: 150 })]).expect(400)).body.error.details.reason).toBe("TOO_FAST");
      expect((await ping([point(15.6, 78.3, { recordedAt: new Date(Date.now() - 5 * MIN).toISOString() })]).expect(400)).body.error.details.reason).toBe("STALE_OR_FUTURE");
      expect(redis.store.get(`gps:rejected:${ids.trip}`)).toBe("3");
      expect(redis.store.has(`bus:live:${ids.trip}`)).toBe(false);
      expect(tables.gpsLocation).toHaveLength(0);
    });

    it("rejects more than 20 points", async () => {
      await startTrip();
      await ping(Array.from({ length: 21 }, near)).expect(400);
    });

    it("accepts: live state in Redis, one Postgres sample per 30 s, bus:position to the trip room", async () => {
      await startTrip();
      const socket = await connect();
      expect(await subscribe(socket, `trip:${ids.trip}`)).toEqual({ ok: true });
      const event = next<any>(socket, "bus:position");

      // Two points out of order: the latest one is the live position
      const later = point(15.4786, 78.4836, { recordedAt: new Date().toISOString() });
      const earlier = point(15.6, 78.3, { recordedAt: new Date(Date.now() - 10_000).toISOString() });
      await ping([later, earlier]).expect(202);

      const live = JSON.parse(redis.store.get(`bus:live:${ids.trip}`)!);
      expect(live).toMatchObject({ tripId: ids.trip, busId: ids.bus, lat: 15.4786, lng: 78.4836, nextStopId: "stopgdl0000001" });
      expect(live.kmAlong).toBeCloseTo(70, 0);
      expect(live.progressPct).toBeCloseTo(53.8, 1);
      expect(tables.gpsLocation).toHaveLength(1);

      const payload = await event;
      expect(payload).toMatchObject({ tripId: ids.trip, busId: ids.bus, lat: 15.4786, nextStopId: "stopgdl0000001" });
      expect(payload).not.toHaveProperty("rooms");

      await ping([point(15.47, 78.5)]).expect(202);
      expect(tables.gpsLocation).toHaveLength(1);
    });

    it("throttles bus:position to one per trip per 2 s", async () => {
      await startTrip();
      const socket = await connect();
      await subscribe(socket, `trip:${ids.trip}`);
      let count = 0;
      socket.on("bus:position", () => count++);
      await ping([point(15.6, 78.3)]).expect(202);
      await ping([point(15.55, 78.35)]).expect(202);
      await ping([point(15.5, 78.4)]).expect(202);
      await new Promise((r) => setTimeout(r, 300));
      expect(count).toBe(1);
    });
  });

  describe("socket rooms", () => {
    it("trip and route rooms are public; depot, district and state need a scoped role", async () => {
      const anon = await connect();
      expect(await subscribe(anon, `trip:${ids.trip}`)).toEqual({ ok: true });
      expect(await subscribe(anon, `route:${ids.route}`)).toEqual({ ok: true });
      expect(await subscribe(anon, `depot:${ids.depot}`)).toEqual({ ok: false, error: "FORBIDDEN" });
      expect(await subscribe(anon, `state:${ids.state}`)).toEqual({ ok: false, error: "FORBIDDEN" });
      // D-034: the bare "state" room is gone, every state room names its state
      expect(await subscribe(anon, "state")).toEqual({ ok: false, error: "VALIDATION_FAILED" });
      expect(await subscribe(anon, "admin:all")).toEqual({ ok: false, error: "VALIDATION_FAILED" });

      const manager = await connect(tokens.manager);
      expect(await subscribe(manager, `depot:${ids.depot}`)).toEqual({ ok: true });
      expect(await subscribe(manager, `depot:${ids.otherDepot}`)).toEqual({ ok: false, error: "FORBIDDEN" });
      expect(await subscribe(manager, `district:${ids.district}`)).toEqual({ ok: false, error: "FORBIDDEN" });

      const district = await connect(tokens.districtOfficer);
      expect(await subscribe(district, `district:${ids.district}`)).toEqual({ ok: true });
      expect(await subscribe(district, `depot:${ids.depot}`)).toEqual({ ok: true });
      expect(await subscribe(district, `depot:${ids.otherDepot}`)).toEqual({ ok: false, error: "FORBIDDEN" });
      expect(await subscribe(district, `state:${ids.state}`)).toEqual({ ok: false, error: "FORBIDDEN" });

      const transport = await connect(tokens.transport);
      expect(await subscribe(transport, `state:${ids.state}`)).toEqual({ ok: true });
      expect(await subscribe(transport, `state:${ids.tgState}`)).toEqual({ ok: false, error: "FORBIDDEN" });
      expect(await subscribe(transport, `district:${ids.district}`)).toEqual({ ok: true });
      expect(await subscribe(transport, `depot:${ids.otherDepot}`)).toEqual({ ok: true });

      const tg = await connect(tokens.tgTransport);
      expect(await subscribe(tg, `state:${ids.tgState}`)).toEqual({ ok: true });
      expect(await subscribe(tg, `state:${ids.state}`)).toEqual({ ok: false, error: "FORBIDDEN" });
      expect(await subscribe(tg, `district:${ids.district}`)).toEqual({ ok: false, error: "FORBIDDEN" });
      expect(await subscribe(tg, `depot:${ids.depot}`)).toEqual({ ok: false, error: "FORBIDDEN" });

      const root = await connect(tokens.root);
      expect(await subscribe(root, `state:${ids.tgState}`)).toEqual({ ok: true });
      expect(await subscribe(root, `depot:${ids.depot}`)).toEqual({ ok: true });

      const citizen = await connect(tokens.citizen);
      expect(await subscribe(citizen, `depot:${ids.depot}`)).toEqual({ ok: false, error: "FORBIDDEN" });
    });

    it("trip:status reaches the depot room on start", async () => {
      const manager = await connect(tokens.manager);
      await subscribe(manager, `depot:${ids.depot}`);
      const status = next<any>(manager, "trip:status");
      await startTrip();
      expect(await status).toMatchObject({ tripId: ids.trip, status: "RUNNING" });
    });

    it("trip:status and bus:position reach the trip's state:{id} room only (D-034)", async () => {
      const ap = await connect(tokens.transport);
      const tg = await connect(tokens.tgTransport);
      await subscribe(ap, `state:${ids.state}`);
      await subscribe(tg, `state:${ids.tgState}`);
      let leaked = 0;
      tg.on("trip:status", () => leaked++);
      tg.on("bus:position", () => leaked++);
      const status = next<any>(ap, "trip:status");
      await startTrip();
      expect(await status).toMatchObject({ tripId: ids.trip, status: "RUNNING" });
      const position = next<any>(ap, "bus:position");
      await ping([point(15.6, 78.3)]).expect(202);
      expect(await position).toMatchObject({ tripId: ids.trip });
      await new Promise((r) => setTimeout(r, 200));
      expect(leaked).toBe(0);
    });
  });

  describe("live views", () => {
    it("GET /tracking/trips/:id/live is public and reflects the latest ping", async () => {
      const before = LiveTripDto.parse((await request(app.getHttpServer()).get(`/api/v1/tracking/trips/${ids.trip}/live`).expect(200)).body);
      expect(before).toMatchObject({ status: "SCHEDULED", position: null, progressPct: 0 });
      expect(before.progress.map((p) => p.state)).toEqual(["CURRENT", "UPCOMING", "UPCOMING"]);

      await startTrip();
      await ping([point(15.4786, 78.4836)]).expect(202);
      const live = LiveTripDto.parse((await request(app.getHttpServer()).get(`/api/v1/tracking/trips/${ids.trip}/live`).expect(200)).body);
      expect(live.position).toMatchObject({ lat: 15.4786, lng: 78.4836 });
      expect(live.nextStop?.stopId).toBe("stopgdl0000001");
      expect(live.progress.map((p) => p.state)).toEqual(["DONE", "DONE", "CURRENT"]);
      // Compressed simulator time is early: Day 12 clamps pace to 0.8.
      expect(live.etaNextStopSec).toBe(70 * 60 * 0.8);
    });

    it("GET /tracking/live: ops roles with scope only", async () => {
      await startTrip();
      await ping([point(15.6, 78.3)]).expect(202);
      const mine = await as("manager").get("/tracking/live").expect(200);
      expect(mine.body).toEqual([expect.objectContaining({ tripId: ids.trip, busRegNo: "AP 39 Z 1234", depotId: ids.depot })]);
      expect((await as("manager").get(`/tracking/live?depotId=${ids.depot}`).expect(200)).body).toHaveLength(1);
      await as("otherManager").get(`/tracking/live?depotId=${ids.depot}`).expect(403);
      expect((await as("otherManager").get("/tracking/live").expect(200)).body).toEqual([]);
      expect((await as("districtOfficer").get(`/tracking/live?districtId=${ids.district}`).expect(200)).body).toHaveLength(1);
      await as("citizen").get("/tracking/live").expect(403);
    });
  });

  describe("POST /driver/incidents", () => {
    it("fills trip, bus and location on the server, marks the trip and the bus, emits incident:new", async () => {
      await startTrip();
      await ping([point(15.6, 78.3)]).expect(202);
      const manager = await connect(tokens.manager);
      await subscribe(manager, `depot:${ids.depot}`);
      const event = next<any>(manager, "incident:new");

      const res = await as("driver").post("/driver/incidents", { type: "BREAKDOWN", note: "Engine overheating" }).expect(201);
      expect(res.body).toMatchObject({ type: "BREAKDOWN", severity: "MEDIUM", status: "OPEN", tripId: ids.trip, busId: ids.bus, lat: 15.6, lng: 78.3, note: "Engine overheating" });
      expect(res.body.code).toMatch(/^INC-[0-9A-Z]{6}$/);
      expect(tables.trip![0]!.hasOpenIncident).toBe(true);
      expect(tables.bus![0]!.status).toBe("BREAKDOWN");
      expect(audits("incident.create")).toHaveLength(1);
      expect(await event).toMatchObject({ code: res.body.code, tripId: ids.trip });
    });

    it("never takes trip or bus ids from the client, and needs an assignment", async () => {
      await as("driver").post("/driver/incidents", { type: "DELAY", tripId: "tripother000001", busId: "busother0000001" }).expect(400);
      tables.tripAssignment = [];
      expect((await as("driver").post("/driver/incidents", { type: "DELAY" }).expect(403)).body.error.code).toBe("TRIP_NOT_ASSIGNED");
    });

    it("falls back to the first stop when there is no position yet", async () => {
      const res = await as("driver").post("/driver/incidents", { type: "TRAFFIC", severity: "LOW" }).expect(201);
      expect(res.body).toMatchObject({ lat: STOPS[0]!.lat, lng: STOPS[0]!.lng, severity: "LOW" });
      expect(tables.bus![0]!.status).toBe("IDLE");
    });
  });
});
