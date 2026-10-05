/* eslint-disable @typescript-eslint/no-explicit-any */
import { PassDto, TicketDto } from "@aptransit/shared";
import { getQueueToken } from "@nestjs/bullmq";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { sealSecret } from "../src/common/crypto/secret-box";
import { DomainEventsService } from "../src/common/events/domain-events.service";
import { configureHttpApp } from "../src/http-app";
import { AuthService } from "../src/modules/auth/auth.service";
import { FakePaymentProvider } from "../src/modules/payments/fake-payment.provider";
import { PAYMENT_PROVIDER } from "../src/modules/payments/payment-provider";
import { QUEUES } from "../src/modules/queue/queue.constants";
import { PrismaService } from "../src/prisma/prisma.service";
import { RedisService } from "../src/redis/redis.service";
import { createFakeRedis } from "./fake-redis";
import { createMemoryPrisma, type Tables } from "./memory-prisma";

// Day 8: gifting, passes with the fake payment endpoint, eligibility and zero fare free travel.
vi.hoisted(() => {
  process.env.PAYMENTS_FAKE = "1";
});

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const STANDARD = ["PALLEVELUGU", "ULTRA_PALLEVELUGU", "CITY_ORDINARY", "METRO_EXPRESS", "EXPRESS"];

const ids = {
  ravi: "userravi000001",
  lakshmi: "userlakshmi0001",
  noname: "usernoname00001",
  express: "tripexpress00001",
  luxury: "tripluxury000001",
  knl: "stopknl0000001",
  vja: "stopvja0000001",
  weekly: "passtypeweekly01",
  monthly: "passtypemonthly1",
  free: "passtypefree0001",
};

const layout = { rows: 10, columns: 4, aisleIndex: 2, labels: Array.from({ length: 40 }, (_, i) => String(i + 1)), blockedCells: [] };

function freshTables(): Tables {
  const qrSecretKey = process.env.QR_SECRET_KEY!;
  const busType = (id: string, serviceType: string, freeTravelEligible: boolean) => ({ id, serviceType, freeTravelEligible, seatLayout: layout });
  const trip = (id: string, busTypeId: string, departsInMin: number) => ({
    id,
    code: `TRP-${id}`,
    routeId: "routeknlvja0001",
    busTypeId,
    status: "SCHEDULED",
    serviceDate: new Date(Date.now() + departsInMin * MIN),
    scheduledDepartureAt: new Date(Date.now() + departsInMin * MIN),
    scheduledArrivalAt: new Date(Date.now() + (departsInMin + 340) * MIN),
    delayMinutes: 0,
    hasOpenIncident: false,
  });
  return {
    user: [
      { id: ids.ravi, email: "citizen@aptransit.test", phone: null, name: "Citizen Ravi", deletedAt: null },
      { id: ids.lakshmi, email: "citizen2@aptransit.test", phone: "+919876543210", name: "Citizen Lakshmi", deletedAt: null },
      { id: ids.noname, email: null, phone: "+919000000001", name: null, deletedAt: null },
    ],
    busType: [busType("bustypeexpress01", "EXPRESS", true), busType("bustypeluxury001", "SUPER_LUXURY", false)],
    trip: [trip(ids.express, "bustypeexpress01", 6 * 60), trip(ids.luxury, "bustypeluxury001", 6 * 60)],
    route: [{ id: "routeknlvja0001", code: "KNL-VJA-01", nameEn: "Kurnool to Vijayawada", nameTe: "Kurnool Vijayawada" }],
    routeStop: [
      { routeId: "routeknlvja0001", stopId: ids.knl, seq: 1, kmFromOrigin: 0, minutesFromOrigin: 0, isBoarding: true, isDropping: false },
      { routeId: "routeknlvja0001", stopId: ids.vja, seq: 2, kmFromOrigin: 340, minutesFromOrigin: 340, isBoarding: false, isDropping: true },
    ],
    stop: [
      { id: ids.knl, nameEn: "Kurnool", nameTe: "Kurnool te" },
      { id: ids.vja, nameEn: "Vijayawada", nameTe: "Vijayawada te" },
    ],
    fareRule: [
      { id: "fareruleexp0001", busTypeId: "bustypeexpress01", baseFarePaise: 4000, perKmPaise: 140, minFarePaise: 5000, reservationFeePaise: 2500, validFrom: new Date("2026-01-01"), validTo: null },
      { id: "fareruleslx0001", busTypeId: "bustypeluxury001", baseFarePaise: 9000, perKmPaise: 220, minFarePaise: 9000, reservationFeePaise: 3000, validFrom: new Date("2026-01-01"), validTo: null },
    ],
    refundPolicy: [
      { id: "policystd00001", name: "Standard", isActive: true, validFrom: new Date("2026-01-01"), cancellationFeePaise: 0, tiers: [{ minHoursBefore: 24, percent: 90 }, { minHoursBefore: 12, percent: 75 }, { minHoursBefore: 1, percent: 50 }, { minHoursBefore: 0, percent: 0 }] },
    ],
    passType: [
      { id: ids.weekly, kind: "WEEKLY", nameEn: "Weekly Pass", nameTe: "Weekly te", durationDays: 7, pricePaise: 45_000, eligibleServiceTypes: STANDARD, scheme: null, isActive: true },
      { id: ids.monthly, kind: "MONTHLY", nameEn: "Monthly Pass", nameTe: "Monthly te", durationDays: 30, pricePaise: 160_000, eligibleServiceTypes: STANDARD, scheme: null, isActive: true },
      { id: ids.free, kind: "FREE_TRAVEL", nameEn: "Free Travel Pass", nameTe: "Free te", durationDays: 365, pricePaise: 0, eligibleServiceTypes: STANDARD, scheme: "STREE_SHAKTI", isActive: true },
    ],
    setting: [],
    ticket: [
      {
        id: "tktgift0000001",
        code: "APT-ABCD-EFGH",
        bookingId: "bkggift000001",
        passengerId: "psggift000001",
        type: "SINGLE",
        status: "BOOKED",
        holderUserId: ids.ravi,
        originalUserId: ids.ravi,
        tripId: ids.express,
        routeId: "routeknlvja0001",
        boardingStopId: ids.knl,
        droppingStopId: ids.vja,
        seatNo: "18",
        farePaise: 54_100,
        activatedAt: null,
        validUntil: null,
        expiresAt: new Date(Date.now() + 6.5 * 60 * MIN),
        qrSecret: sealSecret(Buffer.alloc(32, 3), qrSecretKey),
        giftable: true,
        transferCount: 0,
        version: 1,
      },
    ],
    bookingPassenger: [{ id: "psggift000001", bookingId: "bkggift000001", name: "Citizen Ravi", age: 30, gender: "M", seatNo: "18" }],
    booking: [],
    ticketTransfer: [],
    pass: [],
    eligibilityCheck: [],
    payment: [],
    refund: [],
    auditLog: [],
  };
}

describe("Gifting, passes and free travel (Day 8)", () => {
  let app: NestExpressApplication;
  let tokens: Record<"ravi" | "lakshmi", string>;
  const tables: Tables = {};
  const redis = createFakeRedis();
  const provider = new FakePaymentProvider();
  const events: any[] = [];

  const byId = (model: string, id: unknown) => (tables[model] ?? []).find((r) => r.id === id) ?? null;
  const tripShape = (trip: any) =>
    trip && {
      ...trip,
      busType: byId("busType", trip.busTypeId),
      route: { ...byId("route", trip.routeId), routeStops: tables.routeStop!.filter((rs) => rs.routeId === trip.routeId) },
      assignments: [],
    };
  const prisma = createMemoryPrisma(
    tables,
    {
      ticket: {
        passenger: (t) => byId("bookingPassenger", t.passengerId),
        boardingStop: (t) => byId("stop", t.boardingStopId),
        droppingStop: (t) => byId("stop", t.droppingStopId),
        refunds: (t) => tables.refund!.filter((r) => r.ticketId === t.id),
        trip: (t) => tripShape(byId("trip", t.tripId)),
      },
      trip: { busType: (t) => byId("busType", t.busTypeId), route: (t) => tripShape(t).route },
      booking: {
        passengers: (b) => tables.bookingPassenger!.filter((p) => p.bookingId === b.id),
        trip: (b) => tripShape(byId("trip", b.tripId)),
        user: (b) => byId("user", b.userId),
      },
      pass: {
        passType: (p) => byId("passType", p.passTypeId),
        eligibilityCheck: (p) => byId("eligibilityCheck", p.eligibilityCheckId),
        user: (p) => byId("user", p.userId),
      },
      payment: {
        booking: (p) => byId("booking", p.bookingId),
        refunds: (p) => tables.refund!.filter((r) => r.paymentId === p.id),
      },
    },
    { pass: { status: "PENDING_PAYMENT" }, booking: {}, payment: { status: "CREATED" } },
    { booking: { passengers: { model: "bookingPassenger", fk: "bookingId" } } },
  );

  const as = (who: "ravi" | "lakshmi") => ({
    get: (path: string) => request(app.getHttpServer()).get(`/api/v1${path}`).set("Authorization", `Bearer ${tokens[who]}`),
    post: (path: string, body?: object) =>
      request(app.getHttpServer()).post(`/api/v1${path}`).set("Authorization", `Bearer ${tokens[who]}`).send(body ?? {}),
  });
  const audits = (action: string) => tables.auditLog!.filter((a) => a.action === action);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(RedisService)
      .useValue(redis)
      .overrideProvider(PAYMENT_PROVIDER)
      .useValue(provider)
      .overrideProvider(getQueueToken(QUEUES.EXPIRY))
      .useValue({ add: async () => ({}), remove: async () => 1 })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true, rawBody: true });
    configureHttpApp(app);
    await app.init();
    const auth = moduleRef.get(AuthService) as any;
    const citizen = [{ role: "CITIZEN", depotId: null, districtId: null }];
    tokens = { ravi: await auth.generateAccessToken(ids.ravi, citizen), lakshmi: await auth.generateAccessToken(ids.lakshmi, citizen) };
    const bus = moduleRef.get(DomainEventsService);
    bus.on("ticket.transferred", (e) => void events.push({ name: "ticket.transferred", ...e }));
    bus.on("booking.confirmed", (e) => void events.push({ name: "booking.confirmed", ...e }));
  });

  beforeEach(() => {
    for (const key of Object.keys(tables)) delete tables[key];
    Object.assign(tables, freshTables());
    redis.store.clear();
    events.length = 0;
  });

  afterAll(async () => {
    process.env.PAYMENTS_FAKE = "0";
    await app.close();
  });

  describe("POST /tickets/:id/transfer", () => {
    const ticketId = "tktgift0000001";

    it("gifts to a user found by phone: new holder, name, count, secret, transfer row, audit, event", async () => {
      const oldSecret = tables.ticket![0]!.qrSecret;
      const res = await as("ravi").post(`/tickets/${ticketId}/transfer`, { recipient: "98765 43210" }).expect(200);
      expect(res.body).toEqual({ ticketId, recipientMasked: "+91******3210" });

      const ticket = tables.ticket![0]!;
      expect(ticket).toMatchObject({ holderUserId: ids.lakshmi, transferCount: 1, version: 2 });
      expect(ticket.qrSecret).not.toBe(oldSecret);
      expect(tables.bookingPassenger![0]!.name).toBe("Citizen Lakshmi");
      expect(tables.ticketTransfer).toEqual([expect.objectContaining({ ticketId, fromUserId: ids.ravi, toUserId: ids.lakshmi })]);
      expect(audits("ticket.transfer")).toHaveLength(1);
      expect(events).toContainEqual(expect.objectContaining({ name: "ticket.transferred", ticketId, toUserId: ids.lakshmi }));

      // The sender loses access at once; the recipient sees it
      await as("ravi").get(`/tickets/${ticketId}`).expect(404);
      const mine = TicketDto.parse((await as("lakshmi").get(`/tickets/${ticketId}`).expect(200)).body);
      expect(mine.passengerName).toBe("Citizen Lakshmi");
      expect(mine.canGift).toBe(false);
    });

    it("finds the recipient by email in any case, and masks a nameless recipient", async () => {
      await as("ravi").post(`/tickets/${ticketId}/transfer`, { recipient: "CITIZEN2@aptransit.test" }).expect(200);
      expect(tables.ticket![0]!.holderUserId).toBe(ids.lakshmi);

      Object.assign(tables, freshTables());
      await as("ravi").post(`/tickets/${ticketId}/transfer`, { recipient: "+91 90000 00001" }).expect(200);
      expect(tables.bookingPassenger![0]!.name).toBe("+91******0001");
    });

    const denial = async (code: string, body = { recipient: "citizen2@aptransit.test" }) => {
      const res = await as("ravi").post(`/tickets/${ticketId}/transfer`, body).expect(422);
      expect(res.body.error.code).toBe(code);
      expect(tables.ticket![0]!.holderUserId).toBe(ids.ravi);
      expect(audits("ticket.transfer_denied").at(-1)?.after).toEqual({ reason: code });
    };

    it("denies a free travel ticket", async () => {
      Object.assign(tables.ticket![0]!, { type: "FREE_TRAVEL", giftable: false });
      await denial("TICKET_NOT_GIFTABLE");
    });

    it("denies an activated ticket", async () => {
      tables.ticket![0]!.status = "ACTIVE";
      await denial("TICKET_NOT_GIFTABLE");
    });

    it("denies a second gift (gift.maxTransfers 1)", async () => {
      tables.ticket![0]!.transferCount = 1;
      await denial("TICKET_NOT_GIFTABLE");
    });

    it("denies inside 120 minutes of departure", async () => {
      tables.trip![0]!.scheduledDepartureAt = new Date(Date.now() + 119 * MIN);
      await denial("TICKET_NOT_GIFTABLE");
    });

    it("denies an unknown recipient", async () => {
      await denial("RECIPIENT_NOT_FOUND", { recipient: "nobody@aptransit.test" });
    });

    it("denies a gift to yourself", async () => {
      await denial("GIFT_TO_SELF", { recipient: "citizen@aptransit.test" });
    });

    it("rejects a recipient that is neither phone nor email", async () => {
      const res = await as("ravi").post(`/tickets/${ticketId}/transfer`, { recipient: "12345" }).expect(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    });

    it("same Idempotency-Key returns the first result, without a second transfer", async () => {
      const key = "2b1f2d43-8f0e-4a3b-9c71-0d1e2f3a4b5c";
      const send = () =>
        request(app.getHttpServer())
          .post(`/api/v1/tickets/${ticketId}/transfer`)
          .set("Authorization", `Bearer ${tokens.ravi}`)
          .set("Idempotency-Key", key)
          .send({ recipient: "citizen2@aptransit.test" });
      const first = await send().expect(200);
      const second = await send().expect(200);
      expect(second.body).toEqual(first.body);
      expect(tables.ticketTransfer).toHaveLength(1);
    });
  });

  describe("passes", () => {
    it("lists pass types publicly", async () => {
      const res = await request(app.getHttpServer()).get("/api/v1/pass-types").expect(200);
      expect(res.body.map((t: any) => t.kind)).toEqual(["FREE_TRAVEL", "WEEKLY", "MONTHLY"]);
    });

    it("buys a weekly pass with the fake payment, activates it, and refuses a second active weekly pass", async () => {
      const buy = async () => {
        const created = PassDto.parse((await as("ravi").post("/passes", { passTypeId: ids.weekly }).expect(201)).body);
        expect(created.status).toBe("PENDING_PAYMENT");
        const order = await as("ravi").post("/payments/orders", { passId: created.id }).expect(200);
        expect(order.body.amountPaise).toBe(45_000);
        const paid = await as("ravi").post("/payments/test/complete", { orderId: order.body.orderId }).expect(200);
        expect(paid.body).toEqual({ kind: "PASS", passId: created.id });
        return created.id;
      };

      const first = await buy();
      expect(tables.pass!.find((p) => p.id === first)).toMatchObject({ status: "READY" });
      expect(audits("pass.create")).toHaveLength(1);

      const active = PassDto.parse((await as("ravi").post(`/passes/${first}/activate`).expect(200)).body);
      expect(active.status).toBe("ACTIVE");
      expect(new Date(active.validUntil!).getTime() - new Date(active.validFrom!).getTime()).toBe(7 * DAY);
      expect(audits("pass.activate")).toHaveLength(1);

      const qr = await as("ravi").get(`/passes/${first}/qr`).expect(200);
      expect(qr.body.rotSecret).toEqual(expect.any(String));
      expect(qr.body.periodSec).toBe(30);

      // The first pass is READY now, so this buys a new one
      const second = await buy();
      const again = await as("ravi").post(`/passes/${second}/activate`).expect(409);
      expect(again.body.error.code).toBe("PASS_ALREADY_ACTIVE");
      const list = (await as("ravi").get("/passes").expect(200)).body as PassDto[];
      expect(list.find((p) => p.id === second)?.canActivate).toBe(false);
    });

    it("a READY pass has a token but no rotating secret, and is owner only", async () => {
      const created = (await as("ravi").post("/passes", { passTypeId: ids.weekly }).expect(201)).body;
      const qr = await as("ravi").get(`/passes/${created.id}/qr`).expect(200);
      expect(qr.body.rotSecret).toBeNull();
      await as("lakshmi").get(`/passes/${created.id}/qr`).expect(404);
      await as("lakshmi").post(`/passes/${created.id}/activate`).expect(404);
      await as("lakshmi").post("/payments/orders", { passId: created.id }).expect(404);
    });

    it("a retried Buy reuses the open unpaid pass", async () => {
      const a = (await as("ravi").post("/passes", { passTypeId: ids.monthly }).expect(201)).body;
      const b = (await as("ravi").post("/passes", { passTypeId: ids.monthly }).expect(201)).body;
      expect(b.id).toBe(a.id);
      expect(tables.pass).toHaveLength(1);
    });

    it("a free travel pass without eligibility is ELIGIBILITY_REQUIRED", async () => {
      const res = await as("ravi").post("/passes", { passTypeId: ids.free }).expect(422);
      expect(res.body.error.code).toBe("ELIGIBILITY_REQUIRED");
    });
  });

  describe("eligibility", () => {
    const declaration = { consent: true, declaration: { category: "WOMAN", apDomicile: true }, idType: "VOTER_ID" };

    it("stores only scheme, result and references, never the declaration", async () => {
      const res = await as("lakshmi").post("/eligibility/stree-shakti", declaration).expect(200);
      expect(res.body).toMatchObject({ scheme: "STREE_SHAKTI", result: "ELIGIBLE", reasonCode: null });
      const row = tables.eligibilityCheck![0]!;
      expect(Object.keys(row).sort()).toEqual(["checkedAt", "createdAt", "expiresAt", "id", "provider", "providerRef", "reasonCode", "result", "scheme", "userId"]);
      expect(JSON.stringify(row)).not.toMatch(/WOMAN|VOTER|apDomicile/);
      expect(row.expiresAt.getTime() - row.checkedAt.getTime()).toBe(365 * DAY);
      expect(audits("eligibility.check")[0]!.after).toEqual({ scheme: "STREE_SHAKTI", result: "ELIGIBLE", reasonCode: null });
      expect((await as("lakshmi").get("/eligibility").expect(200)).body).toHaveLength(1);
    });

    it("rejects an ID number or any unknown key", async () => {
      await as("lakshmi").post("/eligibility/stree-shakti", { ...declaration, idNumber: "123412341234" }).expect(400);
      await as("lakshmi").post("/eligibility/stree-shakti", { ...declaration, declaration: { ...declaration.declaration, aadhaar: "1" } }).expect(400);
      expect(tables.eligibilityCheck).toHaveLength(0);
    });

    it("explains NOT_ELIGIBLE with a reason code", async () => {
      const cases: [object, string][] = [
        [{ ...declaration, consent: false }, "CONSENT_REQUIRED"],
        [{ ...declaration, declaration: { category: "MAN", apDomicile: true } }, "CATEGORY_NOT_COVERED"],
        [{ ...declaration, declaration: { category: "GIRL", apDomicile: false } }, "DOMICILE_REQUIRED"],
      ];
      for (const [body, reason] of cases) {
        const res = await as("lakshmi").post("/eligibility/stree-shakti", body).expect(200);
        expect(res.body).toMatchObject({ result: "NOT_ELIGIBLE", reasonCode: reason });
      }
      const pass = await as("lakshmi").post("/passes", { passTypeId: ids.free }).expect(422);
      expect(pass.body.error.code).toBe("ELIGIBILITY_REQUIRED");
    });
  });

  describe("free travel booking", () => {
    const booking = (tripId: string, seatNo = "5") => ({
      tripId,
      boardingStopId: ids.knl,
      droppingStopId: ids.vja,
      passengers: [{ name: "Citizen Lakshmi", age: 34, gender: "F", seatNo }],
      useFreeTravel: true,
    });

    async function activeFreePass() {
      await as("lakshmi")
        .post("/eligibility/stree-shakti", { consent: true, declaration: { category: "WOMAN", apDomicile: true }, idType: "AADHAAR" })
        .expect(200);
      const pass = (await as("lakshmi").post("/passes", { passTypeId: ids.free }).expect(201)).body;
      expect(pass.status).toBe("READY");
      const dup = await as("lakshmi").post("/passes", { passTypeId: ids.free }).expect(409);
      expect(dup.body.error.code).toBe("PASS_ALREADY_ACTIVE");
      await as("lakshmi").post(`/passes/${pass.id}/activate`).expect(200);
    }

    it("eligibility, free pass, then a zero fare FREE_TRAVEL ticket on an Express without payment", async () => {
      await activeFreePass();
      const res = await as("lakshmi").post("/bookings", booking(ids.express)).expect(201);
      expect(res.body).toMatchObject({ status: "CONFIRMED", totalPaise: 0 });
      const ticket = tables.ticket!.find((t) => t.bookingId === res.body.id)!;
      expect(ticket).toMatchObject({ type: "FREE_TRAVEL", farePaise: 0, giftable: false, status: "BOOKED", seatNo: "5", holderUserId: ids.lakshmi });
      expect(tables.payment).toHaveLength(0);
      expect(redis.store.has(`hold:${ids.express}:5`)).toBe(false);
      expect(events).toContainEqual(expect.objectContaining({ name: "booking.confirmed", bookingId: res.body.id }));

      // Free tickets can never be gifted
      const gift = await as("lakshmi").post(`/tickets/${ticket.id}/transfer`, { recipient: "citizen@aptransit.test" }).expect(422);
      expect(gift.body.error.code).toBe("TICKET_NOT_GIFTABLE");
    });

    it("the same on a Super Luxury is PASS_NOT_ELIGIBLE", async () => {
      await activeFreePass();
      const res = await as("lakshmi").post("/bookings", booking(ids.luxury)).expect(422);
      expect(res.body.error.code).toBe("PASS_NOT_ELIGIBLE");
      expect(tables.booking).toHaveLength(0);
    });

    it("needs an active pass and exactly one passenger", async () => {
      const noPass = await as("lakshmi").post("/bookings", booking(ids.express)).expect(422);
      expect(noPass.body.error.code).toBe("PASS_NOT_ELIGIBLE");
      await activeFreePass();
      const two = { ...booking(ids.express), passengers: [...booking(ids.express).passengers, { name: "B", age: 9, gender: "F", seatNo: "6" }] };
      const res = await as("lakshmi").post("/bookings", two).expect(422);
      expect(res.body.error.code).toBe("PASS_NOT_ELIGIBLE");
    });
  });
});
