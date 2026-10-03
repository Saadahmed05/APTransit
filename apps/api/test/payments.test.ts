/* eslint-disable @typescript-eslint/no-explicit-any */
import { getQueueToken } from "@nestjs/bullmq";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { openSecret } from "../src/common/crypto/secret-box";
import { DomainEventsService } from "../src/common/events/domain-events.service";
import { configureHttpApp } from "../src/http-app";
import { AuthService } from "../src/modules/auth/auth.service";
import { FakePaymentProvider } from "../src/modules/payments/fake-payment.provider";
import { hmacSha256Hex, PAYMENT_PROVIDER } from "../src/modules/payments/payment-provider";
import { paymentsFakeEnabled } from "../src/modules/payments/payments.module";
import { QUEUES } from "../src/modules/queue/queue.constants";
import { PrismaService } from "../src/prisma/prisma.service";
import { RedisService } from "../src/redis/redis.service";
import { createFakeRedis } from "./fake-redis";

// This file also covers POST /payments/test/complete, which only exists with PAYMENTS_FAKE=1.
// Set before AppModule is evaluated; restored in afterAll.
vi.hoisted(() => {
  process.env.PAYMENTS_FAKE = "1";
});

// In memory tables. $transaction restores them when the callback throws, like a real rollback.
type Db = Record<"bookings" | "passengers" | "payments" | "tickets" | "refunds" | "audit", any[]>;

function emptyDb(): Db {
  return { bookings: [], passengers: [], payments: [], tickets: [], refunds: [], audit: [] };
}

function matches(row: any, where: any = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (cond && typeof cond === "object" && !(cond instanceof Date) && "in" in cond) return (cond as any).in.includes(row[key]);
    return row[key] === cond;
  });
}

let seq = 0;
const nextId = (prefix: string) => `${prefix}${String(++seq).padStart(10, "0")}`;

describe("Payments (Day 6)", () => {
  let app: NestExpressApplication;
  let token: string;
  let otherToken: string;
  let provider: FakePaymentProvider;
  let events: { bookingId: string; ticketIds: string[] }[];
  let db: Db = emptyDb();
  const redis = createFakeRedis();
  const userId = "userpayer00001";
  const otherUserId = "userother00001";
  const tripId = "trippay0000001";

  const trip = {
    id: tripId,
    routeId: "routepay000001",
    status: "SCHEDULED",
    delayMinutes: 0,
    scheduledDepartureAt: new Date(Date.now() + 6 * 3_600_000),
    route: { routeStops: [{ stopId: "stopfrom00001", minutesFromOrigin: 0 }, { stopId: "stopto000001", minutesFromOrigin: 340 }] },
  };

  const prisma: any = {
    $queryRaw: async () => [1],
    $transaction: async (cb: any) => {
      const snapshot = structuredClone(db);
      try {
        return await cb(prisma);
      } catch (err) {
        db = snapshot;
        throw err;
      }
    },
    booking: {
      findUnique: async ({ where, include }: any) => {
        const b = db.bookings.find((x) => x.id === where.id);
        if (!b) return null;
        return {
          ...b,
          ...(include?.user ? { user: { name: "Asha", email: "asha@example.test", phone: null } } : {}),
          ...(include?.passengers ? { passengers: db.passengers.filter((p) => p.bookingId === b.id) } : {}),
        };
      },
      updateMany: async ({ where, data }: any) => {
        const rows = db.bookings.filter((b) => matches(b, where));
        rows.forEach((b) => Object.assign(b, data));
        return { count: rows.length };
      },
    },
    payment: {
      findFirst: async ({ where }: any) => db.payments.filter((p) => matches(p, where)).at(-1) ?? null,
      create: async ({ data }: any) => {
        const row = { id: nextId("pmt"), status: "CREATED", providerPaymentId: null, createdAt: new Date(), ...data };
        db.payments.push(row);
        return row;
      },
      findUnique: async ({ where }: any) => {
        const p = db.payments.find((x) => (where.id ? x.id === where.id : x.providerOrderId === where.providerOrderId));
        if (!p) return null;
        const b = db.bookings.find((x) => x.id === p.bookingId);
        return {
          ...p,
          refunds: db.refunds.filter((r) => r.paymentId === p.id),
          booking: b && {
            ...b,
            passengers: db.passengers.filter((x) => x.bookingId === b.id).sort((a, c) => a.seatNo.localeCompare(c.seatNo)),
            trip: { ...trip, scheduledDepartureAt: trip.scheduledDepartureAt },
          },
        };
      },
      updateMany: async ({ where, data }: any) => {
        const rows = db.payments.filter((p) => matches(p, where));
        rows.forEach((p) => Object.assign(p, data));
        return { count: rows.length };
      },
    },
    ticket: {
      count: async ({ where }: any) => db.tickets.filter((t) => matches(t, where)).length,
      create: async ({ data }: any) => {
        const row = { id: nextId("tkt"), ...data };
        db.tickets.push(row);
        return { id: row.id };
      },
      findMany: async ({ where }: any) => db.tickets.filter((t) => matches(t, where)).map((t) => ({ id: t.id })),
    },
    refundPolicy: { findFirst: async () => ({ id: "policystd0001" }) },
    refund: {
      create: async ({ data }: any) => {
        const row = { id: nextId("rfd"), ...data };
        db.refunds.push(row);
        return row;
      },
    },
    setting: { findUnique: async () => null, findMany: async () => [] },
    auditLog: {
      create: async ({ data }: any) => {
        db.audit.push(data);
        return data;
      },
    },
    onModuleDestroy: async () => undefined,
  };

  /** A PENDING_PAYMENT booking for two seats, held in Redis like POST /bookings leaves it. */
  function seedBooking(options: { owner?: string; holdExpiresAt?: Date; seats?: string[] } = {}) {
    const id = nextId("bkg");
    const seats = options.seats ?? ["7", "8"];
    db.bookings.push({
      id,
      code: `BKG-${id.slice(-6).toUpperCase()}`,
      userId: options.owner ?? userId,
      tripId,
      boardingStopId: "stopfrom00001",
      droppingStopId: "stopto000001",
      status: "PENDING_PAYMENT",
      totalPaise: 54_100 * seats.length,
      holdExpiresAt: options.holdExpiresAt ?? new Date(Date.now() + 10 * 60_000),
    });
    for (const seatNo of seats) {
      db.passengers.push({ id: nextId("bps"), bookingId: id, name: `P${seatNo}`, age: 30, gender: "F", seatNo });
      redis.store.set(`hold:${tripId}:${seatNo}`, id);
    }
    redis.store.set(`holdcount:${tripId}`, String(Number(redis.store.get(`holdcount:${tripId}`) ?? 0) + seats.length));
    return id;
  }

  const post = (path: string, body: object, auth = token, headers: Record<string, string> = {}) =>
    request(app.getHttpServer()).post(`/api/v1${path}`).set("Authorization", `Bearer ${auth}`).set(headers).send(body);

  async function orderFor(bookingId: string) {
    const res = await post("/payments/orders", { bookingId }).expect(200);
    return res.body.orderId as string;
  }

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
    moduleRef.get(DomainEventsService).on("booking.confirmed", (e) => {
      events.push(e);
    });
  });

  beforeEach(() => {
    db = emptyDb();
    redis.store.clear();
    events = [];
    provider.orders.clear();
    provider.payments.clear();
    provider.refunds.length = 0;
  });

  afterAll(async () => {
    await app.close();
    process.env.PAYMENTS_FAKE = "0";
  });

  describe("POST /payments/orders", () => {
    it("creates one order for the booking total and reuses it", async () => {
      const bookingId = seedBooking();
      const first = await post("/payments/orders", { bookingId }).expect(200);
      expect(first.body).toMatchObject({ amountPaise: 108_200, currency: "INR", keyId: "rzp_test_fake" });
      expect(first.body.prefill).toEqual({ name: "Asha", email: "asha@example.test", contact: null });
      const second = await post("/payments/orders", { bookingId }).expect(200);
      expect(second.body.orderId).toBe(first.body.orderId);
      expect(db.payments).toHaveLength(1);
    });

    it("refuses someone else's booking, an expired hold and a paid booking", async () => {
      const bookingId = seedBooking();
      await post("/payments/orders", { bookingId }, otherToken).expect(404);

      const expired = seedBooking({ seats: ["9"], holdExpiresAt: new Date(Date.now() - 1000) });
      expect((await post("/payments/orders", { bookingId: expired }).expect(410)).body.error.code).toBe("HOLD_EXPIRED");

      db.bookings[0].status = "CONFIRMED";
      expect((await post("/payments/orders", { bookingId }).expect(409)).body.error.code).toBe("BOOKING_NOT_PAYABLE");
    });
  });

  describe("POST /payments/verify", () => {
    it("happy path: tickets only after verification, holds released, event and audit written", async () => {
      const bookingId = seedBooking();
      const paid = provider.pay(await orderFor(bookingId));
      expect(db.tickets).toHaveLength(0);

      const res = await post("/payments/verify", paid).expect(200);
      expect(res.body).toEqual({ kind: "BOOKING", bookingId, ticketIds: expect.any(Array) });
      expect(res.body.ticketIds).toHaveLength(2);

      expect(db.bookings[0].status).toBe("CONFIRMED");
      expect(db.payments[0]).toMatchObject({ status: "CAPTURED", providerPaymentId: paid.razorpayPaymentId });
      expect(db.payments[0].raw.vpa).toBe("[redacted]");
      expect(db.payments[0].raw.contact).toBe("[redacted]");

      const ticket = db.tickets[0];
      expect(ticket).toMatchObject({ type: "SINGLE", status: "BOOKED", holderUserId: userId, originalUserId: userId, farePaise: 54_100, giftable: true });
      expect(ticket.code).toMatch(/^APT-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
      expect(ticket.expiresAt.getTime()).toBe(trip.scheduledDepartureAt.getTime() + 30 * 60_000);
      expect(openSecret(ticket.qrSecret, process.env.QR_SECRET_KEY!)).toHaveLength(32);

      expect(redis.store.has(`hold:${tripId}:7`)).toBe(false);
      expect(redis.store.has(`holdcount:${tripId}`)).toBe(false);
      expect(events).toEqual([{ bookingId, userId, tripId, ticketIds: res.body.ticketIds }]);
      expect(db.audit.some((a) => a.action === "payment.verify" && a.after.result === "CONFIRMED")).toBe(true);
    });

    it("rejects a wrong signature without touching the booking", async () => {
      const bookingId = seedBooking();
      const paid = provider.pay(await orderFor(bookingId));
      const res = await post("/payments/verify", { ...paid, razorpaySignature: "0".repeat(64) }).expect(422);
      expect(res.body.error.code).toBe("PAYMENT_SIGNATURE_INVALID");
      expect(db.tickets).toHaveLength(0);
      expect(db.bookings[0].status).toBe("PENDING_PAYMENT");
    });

    it("rejects an amount that differs from the booking total", async () => {
      const bookingId = seedBooking();
      const paid = provider.pay(await orderFor(bookingId), { amountPaise: 100 });
      const res = await post("/payments/verify", paid).expect(422);
      expect(res.body.error.code).toBe("PAYMENT_AMOUNT_MISMATCH");
      expect(db.tickets).toHaveLength(0);
    });

    it("captures an authorized payment before confirming", async () => {
      const bookingId = seedBooking();
      const paid = provider.pay(await orderFor(bookingId), { status: "authorized" });
      await post("/payments/verify", paid).expect(200);
      expect(provider.captures).toContain(paid.razorpayPaymentId);
      expect(db.tickets).toHaveLength(2);
    });

    it("double verify returns the same ticket ids, with or without an Idempotency-Key", async () => {
      const bookingId = seedBooking();
      const paid = provider.pay(await orderFor(bookingId));
      const key = { "Idempotency-Key": "3b0f8b0e-2d4c-4b6a-9f51-1c2d3e4f5a6b" };
      const first = await post("/payments/verify", paid, token, key).expect(200);
      const cached = await post("/payments/verify", paid, token, key).expect(200);
      const plain = await post("/payments/verify", paid).expect(200);
      expect(cached.body).toEqual(first.body);
      expect(plain.body).toEqual(first.body);
      expect(db.tickets).toHaveLength(2);
      expect(events).toHaveLength(1);
    });

    it("refuses another user's payment", async () => {
      const bookingId = seedBooking();
      const paid = provider.pay(await orderFor(bookingId));
      await post("/payments/verify", paid, otherToken).expect(404);
      expect(db.tickets).toHaveLength(0);
    });

    it("late payment after the hold expired and the seats were taken: refund, no tickets", async () => {
      const bookingId = seedBooking({ seats: ["12"] });
      const paid = provider.pay(await orderFor(bookingId));
      // The hold lapsed, the expiry job ran, and another booking holds seat 12 now
      db.bookings[0].status = "EXPIRED";
      redis.store.set(`hold:${tripId}:12`, "someoneelse0001");

      const res = await post("/payments/verify", paid).expect(410);
      expect(res.body.error.code).toBe("HOLD_EXPIRED");
      expect(db.tickets).toHaveLength(0);
      expect(provider.refunds).toEqual([{ id: expect.any(String), paymentId: paid.razorpayPaymentId, amountPaise: 54_100 }]);
      expect(db.refunds[0]).toMatchObject({ amountPaise: 54_100, status: "PROCESSED", reason: "LATE_PAYMENT_SEATS_UNAVAILABLE" });
      expect(db.payments[0].status).toBe("CAPTURED");
      expect(redis.store.get(`hold:${tripId}:12`)).toBe("someoneelse0001");
      expect(db.audit.some((a) => a.action === "refund.create")).toBe(true);

      // A retry or the webhook never refunds twice
      await post("/payments/verify", paid).expect(410);
      const hook = provider.webhook("payment.captured", paid.razorpayPaymentId);
      await request(app.getHttpServer())
        .post("/api/v1/payments/webhook")
        .set("X-Razorpay-Signature", hook.signature)
        .set("Content-Type", "application/json")
        .send(hook.body)
        .expect(200);
      expect(provider.refunds).toHaveLength(1);
    });

    it("late payment with the seats still free is honoured", async () => {
      const bookingId = seedBooking({ seats: ["14"], holdExpiresAt: new Date(Date.now() + 60_000) });
      const paid = provider.pay(await orderFor(bookingId));
      db.bookings[0].status = "EXPIRED";
      redis.store.delete(`hold:${tripId}:14`);
      await post("/payments/verify", paid).expect(200);
      expect(db.bookings[0].status).toBe("CONFIRMED");
      expect(provider.refunds).toHaveLength(0);
    });
  });

  describe("POST /payments/test/complete (dev and CI only)", () => {
    it("is registered only with PAYMENTS_FAKE=1 outside production", () => {
      expect(paymentsFakeEnabled({ APP_ENV: "development", PAYMENTS_FAKE: "1" })).toBe(true);
      expect(paymentsFakeEnabled({ APP_ENV: "development", PAYMENTS_FAKE: "0" })).toBe(false);
      expect(paymentsFakeEnabled({ APP_ENV: "development", PAYMENTS_FAKE: "true" })).toBe(true);
      expect(paymentsFakeEnabled({ APP_ENV: "production", PAYMENTS_FAKE: "1" })).toBe(false);
    });

    it("confirms the caller's order through confirmBooking, once", async () => {
      const bookingId = seedBooking();
      const orderId = await orderFor(bookingId);
      const first = await post("/payments/test/complete", { orderId }).expect(200);
      expect(first.body).toEqual({ kind: "BOOKING", bookingId, ticketIds: expect.any(Array) });
      expect(db.tickets).toHaveLength(2);
      const again = await post("/payments/test/complete", { orderId }).expect(200);
      expect(again.body.ticketIds).toEqual(first.body.ticketIds);
      expect(db.tickets).toHaveLength(2);
      await post("/payments/test/complete", { orderId }, otherToken).expect(404);
    });
  });

  describe("POST /payments/webhook", () => {
    const hookPost = (body: string, signature: string) =>
      request(app.getHttpServer())
        .post("/api/v1/payments/webhook")
        .set("X-Razorpay-Signature", signature)
        .set("Content-Type", "application/json")
        .send(body);

    it("payment.captured confirms; verify afterwards returns the same tickets", async () => {
      const bookingId = seedBooking();
      const paid = provider.pay(await orderFor(bookingId));
      const hook = provider.webhook("payment.captured", paid.razorpayPaymentId);
      await hookPost(hook.body, hook.signature).expect(200);
      expect(db.tickets).toHaveLength(2);

      const res = await post("/payments/verify", paid).expect(200);
      expect(res.body.ticketIds).toEqual(db.tickets.map((t) => t.id));
      expect(db.tickets).toHaveLength(2);
      expect(db.audit.some((a) => a.action === "payment.webhook" && a.after.result === "CONFIRMED")).toBe(true);
    });

    it("verify then webhook creates tickets once", async () => {
      const bookingId = seedBooking();
      const paid = provider.pay(await orderFor(bookingId));
      await post("/payments/verify", paid).expect(200);
      const hook = provider.webhook("payment.captured", paid.razorpayPaymentId);
      await hookPost(hook.body, hook.signature).expect(200);
      await hookPost(hook.body, hook.signature).expect(200);
      expect(db.tickets).toHaveLength(2);
      expect(events).toHaveLength(1);
      const results = db.audit.filter((a) => a.action === "payment.webhook").map((a) => a.after.result);
      expect(results).toEqual(["CONFIRMED", "CONFIRMED"]);
    });

    it("a bad signature gets 400 and changes nothing", async () => {
      const bookingId = seedBooking();
      const paid = provider.pay(await orderFor(bookingId));
      const hook = provider.webhook("payment.captured", paid.razorpayPaymentId);
      const res = await hookPost(hook.body, "f".repeat(64)).expect(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
      await hookPost(hook.body.replace("captured", "captured "), hook.signature).expect(400);
      expect(db.tickets).toHaveLength(0);
    });

    it("payment.failed marks the payment FAILED and keeps the booking", async () => {
      const bookingId = seedBooking();
      const paid = provider.pay(await orderFor(bookingId), { status: "failed" });
      const hook = provider.webhook("payment.failed", paid.razorpayPaymentId);
      await hookPost(hook.body, hook.signature).expect(200);
      expect(db.payments[0].status).toBe("FAILED");
      expect(db.bookings[0].status).toBe("PENDING_PAYMENT");
      expect(db.payments[0].raw.vpa).toBe("[redacted]");
    });

    it("ignores unknown events and unknown orders", async () => {
      const body = JSON.stringify({ event: "order.paid", payload: {} });
      await hookPost(body, hmacSha256Hex(provider.webhookSecret, body)).expect(200);
      expect(db.payments).toHaveLength(0);
    });
  });
});
