/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHmac } from "node:crypto";
import {
  buildQrContent,
  formatIstDate,
  qrStep,
  rotatingCode,
  ValidateTicketResult,
} from "@aptransit/shared";
import { getQueueToken } from "@nestjs/bullmq";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureHttpApp } from "../src/http-app";
import { AuthService } from "../src/modules/auth/auth.service";
import { QrService } from "../src/modules/tickets/qr.service";
import { QUEUES } from "../src/modules/queue/queue.constants";
import { PrismaService } from "../src/prisma/prisma.service";
import { RedisService } from "../src/redis/redis.service";
import { createFakeRedis } from "./fake-redis";
import { createMemoryPrisma, type Tables } from "./memory-prisma";
const tables: Tables = {};
const id = {
  trip: "tripvalidate0001",
  ticket: "ticketvalidate01",
  pass: "passvalidate001",
  user: "conductoruser01",
};
const by = (table: string, key: unknown) => (tables[table] ?? []).find((r) => r.id === key) ?? null;
const STOPS = [
  { id: "stopknl0000001", seq: 1, lat: 15.8281, lng: 78.0373, nameEn: "Kurnool", nameTe: "కర్నూలు" },
  { id: "stoporv0000001", seq: 2, lat: 15.67, lng: 78.11, nameEn: "Orvakal", nameTe: "ఓర్వకల్లు" },
  { id: "stopndl0000001", seq: 3, lat: 15.4786, lng: 78.4836, nameEn: "Nandyal", nameTe: "నంద్యాల" },
];
const stopName = (stopId: unknown) => {
  const stop = STOPS.find((x) => x.id === stopId);
  return stop ? { nameEn: stop.nameEn, nameTe: stop.nameTe } : null;
};
const routeWithStops = () => ({
  ...by("route", "routevalidate01"),
  depot: { districtId: "districtknl0001" },
  routeStops: STOPS.map((x) => ({ stopId: x.id, seq: x.seq, stop: { lat: x.lat, lng: x.lng, nameEn: x.nameEn, nameTe: x.nameTe } })),
});
const prisma = createMemoryPrisma(tables, {
  district: { state: (d) => by("state", d.stateId) },
  tripAssignment: {
    conductor: (a) => by("conductor", a.conductorId),
    trip: (a) => ({ ...by("trip", a.tripId), route: routeWithStops() }),
    bus: (a) => ({ ...by("bus", a.busId), busType: by("busType", "bustype0000001") }),
  },
  ticket: {
    trip: (t) => by("trip", t.tripId),
    scans: (t) =>
      (tables.ticketScan ?? []).filter(
        (s) => s.ticketId === t.id && s.tripId === id.trip && s.result === "VALID",
      ),
    passenger: () => ({ name: "Passenger" }),
    holderUser: () => ({ name: "Citizen" }),
    route: () => ({ nameEn: "Kurnool to Nandyal", nameTe: "\u0c15\u0c30\u0c4d\u0c28\u0c42\u0c32\u0c41" }),
    boardingStop: (t) => stopName(t.boardingStopId),
    droppingStop: (t) => stopName(t.droppingStopId),
  },
  pass: {
    scans: (p) =>
      (tables.ticketScan ?? []).filter(
        (s) => s.passId === p.id && s.tripId === id.trip && s.result === "VALID",
      ),
    user: () => ({ name: "Pass holder" }),
    passType: () => by("passType", "passtype000001"),
  },
});
const redis = createFakeRedis();

describe("Day 12 validation HTTP order", () => {
  let app: NestExpressApplication, qr: QrService, token: string, citizen: string;
  const now = () => new Date();
  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(RedisService)
      .useValue(redis)
      .overrideProvider(getQueueToken(QUEUES.NOTIFICATIONS))
      .useValue({ add: async () => ({}) })
      .overrideProvider(getQueueToken(QUEUES.EXPIRY))
      .useValue({ add: async () => ({}) })
      .compile();
    app = m.createNestApplication({ logger: false });
    configureHttpApp(app);
    await app.init();
    qr = m.get(QrService);
    const auth = m.get(AuthService) as any;
    token = await auth.generateAccessToken(id.user, [
      { role: "CONDUCTOR", depotId: null, districtId: null },
    ]);
    citizen = await auth.generateAccessToken("citizen000001", [
      { role: "CITIZEN", depotId: null, districtId: null },
    ]);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    Object.keys(tables).forEach((k) => delete tables[k]);
    redis.store.clear();
    const n = now();
    Object.assign(tables, {
      state: [{ id: "stateap0000001", minLng: 76.7, minLat: 12.6, maxLng: 84.8, maxLat: 19.95 }],
      district: [{ id: "districtknl0001", stateId: "stateap0000001" }],
      conductor: [{ id: "conductorrow001", userId: id.user }],
      tripAssignment: [
        {
          id: "assignment00001",
          tripId: id.trip,
          conductorId: "conductorrow001",
          busId: "bus00000000001",
          endedAt: null,
        },
      ],
      trip: [
        {
          id: id.trip,
          code: "TRP-TEST",
          status: "RUNNING",
          serviceDate: new Date(formatIstDate(n) + "T00:00:00Z"),
          scheduledDepartureAt: n,
          scheduledArrivalAt: new Date(+n + 600000),
          actualDepartureAt: n,
          actualArrivalAt: null,
          delayMinutes: 0,
          lastStopSeq: 1,
          hasOpenIncident: false,
        },
      ],
      route: [
        { id: "routevalidate01", nameEn: "Kurnool to Nandyal", nameTe: "\u0c15\u0c30\u0c4d\u0c28\u0c42\u0c32\u0c41" },
      ],
      bus: [{ id: "bus00000000001" }],
      busType: [{ id: "bustype0000001", serviceType: "EXPRESS" }],
      ticket: [
        {
          id: id.ticket,
          code: "APT-1234-5678",
          expiresAt: new Date(+n + 600000),
          status: "ACTIVE",
          version: 1,
          qrSecret: qr.newRotSecret(),
          validUntil: new Date(+n + 600000),
          scannedAt: null,
          holderUserId: "citizen000001",
          tripId: id.trip,
          seatNo: "1",
          type: "SINGLE",
          boardingStopId: "stopknl0000001",
          droppingStopId: "stopndl0000001",
        },
      ],
      pass: [
        {
          id: id.pass,
          status: "ACTIVE",
          qrSecret: qr.newRotSecret(),
          validFrom: new Date(+n - 600000),
          validUntil: new Date(+n + 600000),
          // D-036 purchase time copy
          eligibleServiceTypes: ["EXPRESS"],
          groupSize: 1,
          homeStopId: null,
          destStopId: null,
        },
      ],
      passType: [{ id: "passtype000001", eligibleServiceTypes: ["EXPRESS"] }],
      ticketScan: [],
      auditLog: [],
    });
  });
  it("manual entry requires live possession, uses the same rules and records duplicates", async () => {
    const raw = await content(),
      liveCode = raw.split("~")[1];
    const send = (code: string) =>
      request(app.getHttpServer())
        .post("/api/v1/tickets/validate")
        .auth(token, { type: "bearer" })
        .send({
          ticketNumber: "APT-1234-5678",
          liveCode: code,
          tripId: id.trip,
          deviceTime: new Date().toISOString(),
        });
    expect((await send("AAAAAAAA")).body.reason).toBe("STALE_CODE");
    expect((await send(liveCode!)).body.reason).toBe("OK");
    const duplicate = await send(liveCode!);
    expect(duplicate.body.reason).toBe("ALREADY_SCANNED");
    expect(duplicate.body.earlierScanAt).toBeTruthy();
    expect(tables.ticketScan).toHaveLength(3);
  });
  it("manual code alone and ambiguous QR/manual bodies are rejected", async () => {
    const base = {
      ticketNumber: "APT-1234-5678",
      tripId: id.trip,
      deviceTime: new Date().toISOString(),
    };
    expect(
      (
        await request(app.getHttpServer())
          .post("/api/v1/tickets/validate")
          .auth(token, { type: "bearer" })
          .send(base)
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app.getHttpServer())
          .post("/api/v1/tickets/validate")
          .auth(token, { type: "bearer" })
          .send({ ...base, liveCode: "AAAAAAAA", qr: "random" })
      ).status,
    ).toBe(400);
  });
  async function content(
    kind: "T" | "P" = "T",
    offset = 0,
    overrides: Record<string, unknown> = {},
  ) {
    const row = tables[kind === "T" ? "ticket" : "pass"]![0]!;
    const payload = {
      t: kind,
      i: row.id,
      tr: kind === "T" ? id.trip : null,
      d: kind === "T" ? formatIstDate(now()) : null,
      v: Math.floor(row.validUntil.getTime() / 1000),
      ...overrides,
    };
    const token = qr.signToken(payload as any);
    const code = await rotatingCode(
      (key, msg) => new Uint8Array(createHmac("sha256", key).update(msg).digest()),
      qr.decryptRotSecret(row.qrSecret),
      qrStep(Date.now()) + offset,
    );
    return buildQrContent(token, code);
  }
  const scan = (qr: string, auth = token, tripId = id.trip, extra: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post("/api/v1/tickets/validate")
      .set("Authorization", "Bearer " + auth)
      .send({ qr, tripId, deviceTime: now().toISOString(), ...extra });
  /** bus:live:{tripId} as the tracking service writes it. */
  const busAt = (stop: (typeof STOPS)[number], ageMs = 5_000, nextStopSeq = stop.seq + 1) =>
    redis.store.set(
      "bus:live:" + id.trip,
      JSON.stringify({ tripId: id.trip, busId: "bus00000000001", lat: stop.lat, lng: stop.lng, recordedAt: new Date(Date.now() - ageMs).toISOString(), nextStopSeq, nextStopId: null }),
    );

  describe("boarding record and segment checks (D-035)", () => {
    it("records bus, validator and NONE when no GPS is known, and still lets the passenger on", async () => {
      const res = await scan(await content()).expect(200);
      expect(res.body.reason).toBe("OK");
      expect(res.body.context.boardingStop).toBeNull();
      expect(tables.ticketScan![0]).toMatchObject({
        busId: "bus00000000001",
        conductorId: "conductorrow001",
        validatorKind: "CONDUCTOR",
        stopSource: "NONE",
        stopId: null,
        deviceId: null,
      });
    });

    it("records the stop from fresh bus GPS", async () => {
      busAt(STOPS[0]!);
      const res = await scan(await content()).expect(200);
      expect(res.body.reason).toBe("OK");
      expect(res.body.context.boardingStop).toMatchObject({ stopId: "stopknl0000001", nameEn: "Kurnool", source: "BUS_GPS" });
      expect(tables.ticketScan![0]).toMatchObject({ stopId: "stopknl0000001", stopSource: "BUS_GPS", lat: 15.8281, lng: 78.0373 });
    });

    it("rejects a Kurnool to Nandyal ticket scanned at Nandyal with PAST_DESTINATION", async () => {
      busAt(STOPS[2]!, 5_000, 3);
      const res = await scan(await content()).expect(200);
      expect(res.body).toMatchObject({ result: "INVALID", reason: "PAST_DESTINATION" });
      expect(res.body.context.ticketTo).toEqual({ nameEn: "Nandyal", nameTe: "నంద్యాల" });
      expect(tables.ticket![0]!.status).toBe("ACTIVE");
      expect(tables.ticketScan![0]).toMatchObject({ result: "INVALID", reason: "PAST_DESTINATION", stopId: "stopndl0000001" });
    });

    it("rejects boarding more than one stop before the boarding stop", async () => {
      tables.ticket![0]!.boardingStopId = "stopndl0000001";
      tables.ticket![0]!.droppingStopId = "stopndl0000001";
      busAt(STOPS[0]!);
      expect((await scan(await content()).expect(200)).body.reason).toBe("BEFORE_BOARDING_STOP");
    });

    it("uses the device position when the bus GPS is stale, and skips the checks with no position", async () => {
      tables.trip![0]!.lastStopSeq = 2; // the record says the bus passed Orvakal, so Nandyal is next
      busAt(STOPS[2]!, 120_000, 3);
      const withDevice = await scan(await content(), token, id.trip, { position: { lat: 15.4786, lng: 78.4836, accuracyM: 12 } }).expect(200);
      expect(withDevice.body.reason).toBe("PAST_DESTINATION");
      expect(tables.ticketScan![0]).toMatchObject({ stopSource: "DEVICE_GPS", stopId: "stopndl0000001" });
      tables.ticket![0]!.status = "ACTIVE";
      const noPosition = await scan(await content()).expect(200);
      expect(noPosition.body.reason).toBe("OK");
      expect(tables.ticketScan![1]).toMatchObject({ stopSource: "NONE", stopId: null });
    });

    it("bounds the device position by the trip record: a stop two ahead is not trusted", async () => {
      const res = await scan(await content(), token, id.trip, { position: { lat: 15.4786, lng: 78.4836 } }).expect(200);
      expect(res.body.reason).toBe("OK");
      expect(tables.ticketScan![0]).toMatchObject({ stopSource: "NONE", lat: 15.4786 });
    });

    it("ignores a device position outside the state", async () => {
      const res = await scan(await content(), token, id.trip, { position: { lat: 28.6, lng: 77.2 } }).expect(200);
      expect(res.body.reason).toBe("OK");
      expect(tables.ticketScan![0]).toMatchObject({ stopSource: "NONE" });
    });

    it("rejects a pass before its validity starts with NOT_YET_VALID", async () => {
      tables.pass![0]!.validFrom = new Date(Date.now() + 3_600_000);
      const res = await scan(await content("P")).expect(200);
      expect(res.body.reason).toBe("NOT_YET_VALID");
      expect(res.body.context.validFrom).toBe(tables.pass![0]!.validFrom.toISOString());
    });
  });
  it("VALID then ALREADY_SCANNED includes earlier time and writes scans and audit", async () => {
    const code = await content();
    const first = await scan(code).expect(200);
    expect(ValidateTicketResult.parse(first.body).reason).toBe("OK");
    expect(first.body.ticket.seatNo).toBe("1");
    const again = await scan(code).expect(200);
    expect(again.body.reason).toBe("ALREADY_SCANNED");
    expect(again.body.earlierScanAt).toBeTruthy();
    expect(tables.ticketScan).toHaveLength(2);
    expect(tables.auditLog!.filter((r) => r.action === "ticket.scan")).toHaveLength(2);
  });
  it("parsing and signature precede every other check", async () => {
    expect((await scan("garbage").expect(200)).body.reason).toBe("NOT_FOUND");
    const code = await content();
    const [token, rotation] = code.split("~");
    const parts = token!.split(".");
    parts[2] = "AAAA";
    expect((await scan(parts.join(".") + "~" + rotation).expect(200)).body.reason).toBe(
      "BAD_SIGNATURE",
    );
    expect(tables.ticketScan).toHaveLength(2);
  });
  it("90 second old code wins over cancelled status", async () => {
    tables.ticket![0]!.status = "CANCELLED";
    expect((await scan(await content("T", -3)).expect(200)).body.reason).toBe("STALE_CODE");
  });
  it.each([
    ["CANCELLED", "CANCELLED"],
    ["REFUNDED", "CANCELLED"],
    ["EXPIRED", "EXPIRED"],
    ["BOOKED", "NOT_ACTIVATED"],
    ["SCANNED", "ALREADY_SCANNED"],
    ["USED", "ALREADY_SCANNED"],
  ])("returns %s reason", async (status, reason) => {
    tables.ticket![0]!.status = status;
    expect((await scan(await content()).expect(200)).body.reason).toBe(reason);
  });
  it("WRONG_TRIP precedes WRONG_DATE", async () => {
    tables.ticket![0]!.tripId = "othertrip00001";
    tables.trip!.push({ ...tables.trip![0], id: "othertrip00001" });
    expect((await scan(await content("T", 0, { d: "2020-01-01" })).expect(200)).body.reason).toBe(
      "WRONG_TRIP",
    );
  });
  it("returns WRONG_DATE", async () => {
    expect((await scan(await content("T", 0, { d: "2020-01-01" })).expect(200)).body.reason).toBe(
      "WRONG_DATE",
    );
  });
  it("missing ticket after a valid signed token returns NOT_FOUND", async () => {
    expect(
      (await scan(await content("T", 0, { i: "missingticket01" })).expect(200)).body.reason,
    ).toBe("NOT_FOUND");
  });
  it("pass once per trip, READY and service eligibility", async () => {
    const code = await content("P");
    expect((await scan(code).expect(200)).body.reason).toBe("OK");
    expect((await scan(code).expect(200)).body.reason).toBe("ALREADY_SCANNED");
    tables.ticketScan = [];
    tables.pass![0]!.status = "READY";
    expect((await scan(code).expect(200)).body.reason).toBe("NOT_ACTIVATED");
    tables.pass![0]!.status = "ACTIVE";
    tables.pass![0]!.eligibleServiceTypes = ["SUPER_LUXURY"];
    expect((await scan(code).expect(200)).body.reason).toBe("SERVICE_NOT_ELIGIBLE");
  });

  describe("pass catalog rules (D-036)", () => {
    it("a family pass boards 4 people on one trip and refuses the 5th, reporting n of 4", async () => {
      tables.pass![0]!.groupSize = 4;
      const results = [];
      for (let i = 0; i < 5; i++) results.push((await scan(await content("P")).expect(200)).body);
      expect(results.map((r) => r.reason)).toEqual(["OK", "OK", "OK", "OK", "ALREADY_SCANNED"]);
      expect(results.map((r) => r.group)).toEqual([
        { boarded: 1, size: 4 },
        { boarded: 2, size: 4 },
        { boarded: 3, size: 4 },
        { boarded: 4, size: 4 },
        { boarded: 4, size: 4 },
      ]);
      expect(results[4].earlierScanAt).toBeTruthy();
      expect(tables.ticketScan!.filter((x) => x.result === "VALID")).toHaveLength(4);
    });

    it("two parallel scans of a family pass with one place left: exactly one boards", async () => {
      tables.pass![0]!.groupSize = 4;
      for (let i = 0; i < 3; i++) await scan(await content("P")).expect(200);
      const [a, b] = await Promise.all([scan(await content("P")), scan(await content("P"))]);
      expect([a.body.reason, b.body.reason].sort()).toEqual(["ALREADY_SCANNED", "OK"]);
      expect(tables.ticketScan!.filter((x) => x.result === "VALID")).toHaveLength(4);
    });

    it("a single pass reports no group", async () => {
      const res = await scan(await content("P")).expect(200);
      expect(res.body.reason).toBe("OK");
      expect(res.body.group).toBeUndefined();
    });

    it("a school pass works only on a route with both of its stops (ROUTE_NOT_COVERED)", async () => {
      tables.pass![0]!.homeStopId = "stopknl0000001";
      tables.pass![0]!.destStopId = "stopndl0000001";
      expect((await scan(await content("P")).expect(200)).body.reason).toBe("OK");
      tables.ticketScan = [];
      tables.pass![0]!.destStopId = "stopvja0000001";
      expect((await scan(await content("P")).expect(200)).body.reason).toBe("ROUTE_NOT_COVERED");
    });
  });
  it("requires conductor auth and the current trip", async () => {
    const code = await content();
    await scan(code, citizen).expect(403);
    await scan(code, token, "othertrip00001").expect(403);
    await request(app.getHttpServer())
      .post("/api/v1/tickets/validate")
      .send({ qr: code, tripId: id.trip, deviceTime: now().toISOString() })
      .expect(401);
  });
  it("manifest counts includes pass scans", async () => {
    await scan(await content()).expect(200);
    await scan(await content("P")).expect(200);
    const res = await request(app.getHttpServer())
      .get("/api/v1/conductor/today")
      .set("Authorization", "Bearer " + token)
      .expect(200);
    expect(res.body.counts).toEqual({ passengers: 2, checked: 2, pending: 0 });
  });
  it("records local HTTP p95 for 30 validations", async () => {
    const code = await content();
    const samples: number[] = [];
    for (let i = 0; i < 30; i++) {
      const start = performance.now();
      await scan(code).expect(200);
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    process.stdout.write(
      "Validation HTTP p95 (memory database): " + samples[28]!.toFixed(2) + " ms\n",
    );
    expect(samples[28]).toBeLessThan(300);
  });
});
