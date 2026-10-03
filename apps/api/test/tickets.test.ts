/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHmac } from "node:crypto";
import { qrStep, rotatingCode, TicketDto, TicketQrDto } from "@aptransit/shared";
import { getQueueToken } from "@nestjs/bullmq";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { sealSecret } from "../src/common/crypto/secret-box";
import { DomainEventsService } from "../src/common/events/domain-events.service";
import { configureHttpApp } from "../src/http-app";
import { AuthService } from "../src/modules/auth/auth.service";
import { FakePaymentProvider } from "../src/modules/payments/fake-payment.provider";
import { hmacSha256Hex, PAYMENT_PROVIDER } from "../src/modules/payments/payment-provider";
import { QUEUES } from "../src/modules/queue/queue.constants";
import { QrService } from "../src/modules/tickets/qr.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { RedisService } from "../src/redis/redis.service";
import { createFakeRedis } from "./fake-redis";

const MIN = 60_000;
const hmac = (key: Uint8Array, message: Uint8Array) => new Uint8Array(createHmac("sha256", key).update(message).digest());

function matches(row: any, where: any = {}): boolean {
  return Object.entries(where).every(([key, cond]: [string, any]) => {
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      if ("in" in cond) return cond.in.includes(row[key]);
      if ("not" in cond) return row[key] !== cond.not;
    }
    return row[key] === cond;
  });
}

describe("Tickets (Day 7)", () => {
  let app: NestExpressApplication;
  let token: string;
  let otherToken: string;
  let qr: QrService;
  let provider: FakePaymentProvider;
  let events: { ticketId: string; from: string; to: string }[] = [];
  const redis = createFakeRedis();
  const userId = "userholder0001";
  const otherUserId = "userother00001";
  const qrSecretKey = process.env.QR_SECRET_KEY!;

  let tickets: any[] = [];
  let refunds: any[] = [];
  let payments: any[] = [];
  const audit: any[] = [];
  const trip = {
    id: "tripticket0001",
    status: "SCHEDULED",
    serviceDate: new Date("2026-10-04T00:00:00.000Z"),
    scheduledDepartureAt: new Date(),
    delayMinutes: 0,
    hasOpenIncident: false,
    busTypeId: "bustypeexp0001",
    busType: { serviceType: "EXPRESS" },
    route: {
      code: "KNL-VJA-01",
      nameEn: "Kurnool to Vijayawada",
      nameTe: "కర్నూలు నుండి విజయవాడ",
      routeStops: [
        { stopId: "stopfrom00001", minutesFromOrigin: 0 },
        { stopId: "stopto000001", minutesFromOrigin: 340 },
      ],
    },
    assignments: [{ bus: { regNo: "AP 39 Z 1234" } }],
  };

  const withRelations = (t: any) => ({
    ...t,
    passenger: { name: "Asha" },
    boardingStop: { id: "stopfrom00001", nameEn: "Kurnool", nameTe: "కర్నూలు" },
    droppingStop: { id: "stopto000001", nameEn: "Vijayawada", nameTe: "విజయవాడ" },
    refunds: refunds.filter((r) => r.ticketId === t.id).slice(-1),
    trip,
  });

  const prisma: any = {
    $queryRaw: async () => [1],
    $transaction: async (cb: any) => cb(prisma),
    ticket: {
      findMany: async ({ where }: any) => tickets.filter((t) => matches(t, where)).map(withRelations),
      findFirst: async ({ where }: any) => {
        const t = tickets.find((x) => matches(x, where));
        return t ? withRelations(t) : null;
      },
      findUnique: async ({ where }: any) => tickets.find((t) => t.id === where.id) ?? null,
      updateMany: async ({ where, data }: any) => {
        const rows = tickets.filter((t) => matches(t, where));
        for (const t of rows) Object.assign(t, { ...data, version: data.version?.increment ? t.version + data.version.increment : t.version });
        return { count: rows.length };
      },
      update: async ({ where, data }: any) => {
        const t = tickets.find((x) => x.id === where.id);
        Object.assign(t, { ...data, version: data.version?.increment ? t.version + 1 : t.version });
        return t;
      },
    },
    refundPolicy: {
      findFirst: async () => ({
        id: "policystd0001",
        name: "Standard AP Transport Refund Policy",
        cancellationFeePaise: 0,
        tiers: [
          { minHoursBefore: 24, percent: 90 },
          { minHoursBefore: 12, percent: 75 },
          { minHoursBefore: 1, percent: 50 },
          { minHoursBefore: 0, percent: 0 },
        ],
      }),
    },
    fareRule: { findFirst: async () => ({ reservationFeePaise: 3_000 }) },
    setting: { findMany: async () => [], findUnique: async () => null },
    payment: {
      findFirst: async ({ where }: any) => payments.find((p) => p.bookingId === where.bookingId && where.status.in.includes(p.status)) ?? null,
      findUnique: async ({ where }: any) => {
        const p = payments.find((x) => x.id === where.id);
        return p ? { ...p, refunds: refunds.filter((r) => r.paymentId === p.id) } : null;
      },
      update: async ({ where, data }: any) => Object.assign(payments.find((p) => p.id === where.id), data),
    },
    refund: {
      create: async ({ data }: any) => {
        const row = { id: `rfd${refunds.length + 1}0000000`, ...data };
        refunds.push(row);
        return row;
      },
      findUnique: async ({ where }: any) => refunds.find((r) => r.providerRefundId === where.providerRefundId) ?? null,
      updateMany: async ({ where, data }: any) => {
        const rows = refunds.filter((r) => r.id === where.id && r.status !== where.status.not);
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        audit.push(data);
        return data;
      },
    },
    onModuleDestroy: async () => undefined,
  };

  /** A paid BOOKED ticket departing `minutesAway` from now. */
  function seedTicket(minutesAway: number, overrides: Record<string, unknown> = {}) {
    trip.scheduledDepartureAt = new Date(Date.now() + minutesAway * MIN);
    const id = `tkt${String(tickets.length + 1).padStart(10, "0")}`;
    tickets.push({
      id,
      code: "APT-ABCD-EFGH",
      bookingId: "bkg0000000001",
      type: "SINGLE",
      status: "BOOKED",
      holderUserId: userId,
      tripId: trip.id,
      seatNo: "7",
      farePaise: 54_100,
      activatedAt: null,
      validUntil: null,
      expiresAt: new Date(trip.scheduledDepartureAt.getTime() + 30 * MIN),
      qrSecret: sealSecret(Buffer.alloc(32, 7), qrSecretKey),
      giftable: true,
      transferCount: 0,
      version: 1,
      boardingStopId: "stopfrom00001",
      droppingStopId: "stopto000001",
      ...overrides,
    });
    payments.push({ id: "pmt0000000001", bookingId: "bkg0000000001", status: "CAPTURED", providerPaymentId: "pay_paid000001", amountPaise: 54_100, capturedAt: new Date() });
    return id;
  }

  const get = (path: string, auth = token) => request(app.getHttpServer()).get(`/api/v1${path}`).set("Authorization", `Bearer ${auth}`);
  const post = (path: string, auth = token) => request(app.getHttpServer()).post(`/api/v1${path}`).set("Authorization", `Bearer ${auth}`);

  beforeAll(async () => {
    provider = new FakePaymentProvider();
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
    token = await auth.generateAccessToken(userId, [{ role: "CITIZEN", depotId: null, districtId: null }]);
    otherToken = await auth.generateAccessToken(otherUserId, [{ role: "CITIZEN", depotId: null, districtId: null }]);
    qr = moduleRef.get(QrService);
    moduleRef.get(DomainEventsService).on("ticket.status", (e) => {
      events.push(e);
    });
  });

  beforeEach(() => {
    tickets = [];
    refunds = [];
    payments = [];
    events = [];
    audit.length = 0;
    redis.store.clear();
    provider.refunds.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  it("lists upcoming and past tickets for the holder only", async () => {
    seedTicket(120);
    tickets.push({ ...tickets[0], id: "tktold0000001", status: "USED" });
    const upcoming = await get("/tickets?scope=upcoming").expect(200);
    expect(upcoming.body.map((t: any) => t.id)).toEqual([tickets[0].id]);
    expect(upcoming.body[0]).toMatchObject({ seatNo: "7", serviceType: "EXPRESS", boarding: { nameEn: "Kurnool" } });
    const past = await get("/tickets?scope=past").expect(200);
    expect(past.body.map((t: any) => t.id)).toEqual(["tktold0000001"]);
    expect((await get("/tickets", otherToken).expect(200)).body).toEqual([]);
  });

  it("another user gets 404 on someone else's ticket, never 403", async () => {
    const id = seedTicket(30);
    for (const path of [`/tickets/${id}`, `/tickets/${id}/qr`, `/tickets/${id}/refund-quote`]) {
      expect((await get(path, otherToken).expect(404)).body.error.code).toBe("NOT_FOUND");
    }
    await post(`/tickets/${id}/activate`, otherToken).expect(404);
    await post(`/tickets/${id}/cancel`, otherToken).expect(404);
  });

  describe("activation", () => {
    it("activates inside the window, then a second call is 409", async () => {
      const id = seedTicket(30);
      const detail = TicketDto.parse((await get(`/tickets/${id}`).expect(200)).body);
      expect(detail.canActivate).toBe(true);

      const res = await post(`/tickets/${id}/activate`).expect(200);
      expect(res.body.status).toBe("ACTIVE");
      // validUntil = arrival (340 min) + delay 0 + grace 60
      expect(new Date(res.body.validUntil).getTime()).toBe(trip.scheduledDepartureAt.getTime() + 400 * MIN);
      expect(tickets[0].version).toBe(2);
      expect(events).toEqual([{ ticketId: id, holderUserId: userId, from: "BOOKED", to: "ACTIVE" }]);
      expect(audit.some((a) => a.action === "ticket.activate")).toBe(true);

      const again = await post(`/tickets/${id}/activate`).expect(409);
      expect(again.body.error.code).toBe("TICKET_ALREADY_ACTIVE");
    });

    it("same Idempotency-Key returns the first result", async () => {
      const id = seedTicket(30);
      const key = "1f4e6b1a-7c1d-4c55-9b3e-2a7f0f6a1b2c";
      const first = await post(`/tickets/${id}/activate`).set("Idempotency-Key", key).expect(200);
      const second = await post(`/tickets/${id}/activate`).set("Idempotency-Key", key).expect(200);
      expect(second.body).toEqual(first.body);
    });

    it("outside the window is ACTIVATION_WINDOW_CLOSED with the opening time", async () => {
      const id = seedTicket(180);
      const res = await post(`/tickets/${id}/activate`).expect(422);
      expect(res.body.error.code).toBe("ACTIVATION_WINDOW_CLOSED");
      expect(new Date(res.body.error.details.activationOpensAt).getTime()).toBe(trip.scheduledDepartureAt.getTime() - 60 * MIN);
      expect(tickets[0].status).toBe("BOOKED");
    });
  });

  describe("QR", () => {
    it("hides rotSecret before activation and gives a verifiable code after", async () => {
      const id = seedTicket(30);
      const before = TicketQrDto.parse((await get(`/tickets/${id}/qr`).expect(200)).body);
      expect(before.rotSecret).toBeNull();
      expect(before.periodSec).toBe(30);
      expect(qr.verifyToken(before.token)).toMatchObject({ t: "T", i: id, tr: trip.id, d: "2026-10-04" });

      await post(`/tickets/${id}/activate`).expect(200);
      const after = TicketQrDto.parse((await get(`/tickets/${id}/qr`).expect(200)).body);
      expect(after.rotSecret).not.toBeNull();

      // What the ticket screen computes, checked by the service the scanner will use
      const secret = Buffer.from(after.rotSecret!, "base64url");
      const offset = new Date(after.serverTime).getTime() - Date.now();
      const code = await rotatingCode(hmac, secret, qrStep(Date.now(), offset));
      expect(await qr.verifyCode(secret, code, Date.now())).toBe(true);
    });
  });

  describe("cancel and refund", () => {
    it.each([
      // fare part 51,100 (54,100 minus the 3,000 reservation fee)
      ["25 hours before: 90 percent", 25 * 60, 90, 45_990],
      ["13 hours before: 75 percent", 13 * 60, 75, 38_325],
      ["2 hours before: 50 percent", 120, 50, 25_550],
    ])("%s", async (_label, minutesAway, percent, amount) => {
      const id = seedTicket(minutesAway);
      const quote = await get(`/tickets/${id}/refund-quote`).expect(200);
      expect(quote.body).toEqual({ cancellable: true, percent, amountPaise: amount, feePaise: 3_000, policyName: "Standard AP Transport Refund Policy" });

      const res = await post(`/tickets/${id}/cancel`).expect(200);
      expect(res.body.ticket.status).toBe("CANCELLED");
      expect(res.body.refund).toEqual({ amountPaise: amount, status: "PENDING" });
      expect(provider.refunds).toEqual([{ id: expect.any(String), paymentId: "pay_paid000001", amountPaise: amount }]);
      expect(refunds[0]).toMatchObject({ ticketId: id, amountPaise: amount, status: "PENDING", reason: "HOLDER_CANCELLED" });
      expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(["ticket.cancel", "refund.create"]));
    });

    it("under 1 hour or after activation is not cancellable, and a double cancel refunds once", async () => {
      const soon = seedTicket(30);
      expect((await post(`/tickets/${soon}/cancel`).expect(409)).body.error.code).toBe("TICKET_NOT_CANCELLABLE");

      tickets = [];
      const id = seedTicket(300);
      await post(`/tickets/${id}/cancel`).expect(200);
      await post(`/tickets/${id}/cancel`).expect(409);
      expect(provider.refunds).toHaveLength(1);
    });

    it("refund.processed webhook: refund PROCESSED, ticket REFUNDED, payment PARTIALLY_REFUNDED", async () => {
      const id = seedTicket(300);
      await post(`/tickets/${id}/cancel`).expect(200);
      const body = JSON.stringify({
        event: "refund.processed",
        payload: { refund: { entity: { id: refunds[0].providerRefundId, payment_id: "pay_paid000001", amount: 25_550, status: "processed" } } },
      });
      const send = () =>
        request(app.getHttpServer())
          .post("/api/v1/payments/webhook")
          .set("X-Razorpay-Signature", hmacSha256Hex(provider.webhookSecret, body))
          .set("Content-Type", "application/json")
          .send(body)
          .expect(200);
      await send();
      await send();
      expect(refunds[0].status).toBe("PROCESSED");
      expect(tickets[0].status).toBe("REFUNDED");
      expect(payments[0].status).toBe("PARTIALLY_REFUNDED");
      expect(events.filter((e) => e.to === "REFUNDED")).toHaveLength(1);
    });
  });
});
