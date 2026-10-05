/* eslint-disable @typescript-eslint/no-explicit-any */
import { NotificationsPage, NotificationType } from "@aptransit/shared";
import { getQueueToken } from "@nestjs/bullmq";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { DomainEventsService } from "../src/common/events/domain-events.service";
import { configureHttpApp } from "../src/http-app";
import { AuthService } from "../src/modules/auth/auth.service";
import { EMAIL_PROVIDER } from "../src/modules/auth/email.provider";
import { StatusExpiryService } from "../src/modules/lifecycle/status-expiry.service";
import { readWorkerState, WORKER_HEARTBEAT_KEY, writeHeartbeat } from "../src/modules/lifecycle/worker-heartbeat";
import { renderNotificationEmail } from "../src/modules/notifications/email-template";
import { NotificationEmailService } from "../src/modules/notifications/notification-email.service";
import { NotificationsService } from "../src/modules/notifications/notifications.service";
import { QUEUES } from "../src/modules/queue/queue.constants";
import { PrismaService } from "../src/prisma/prisma.service";
import { RedisService } from "../src/redis/redis.service";
import { createFakeRedis } from "./fake-redis";
import { createMemoryPrisma, type Tables } from "./memory-prisma";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = new Date("2026-10-05T06:00:00.000Z");
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

const ravi = "userravi000001";
const lakshmi = "userlakshmi0001";

function freshTables(): Tables {
  return {
    user: [
      { id: ravi, email: "citizen@aptransit.test", phone: null, name: "Citizen Ravi", preferredLocale: "en", deletedAt: null },
      { id: lakshmi, email: "citizen2@aptransit.test", phone: "+919876543210", name: "Citizen Lakshmi", preferredLocale: "te", deletedAt: null },
      { id: "usernoemail0001", email: null, phone: "+919000000001", name: null, preferredLocale: "en", deletedAt: null },
    ],
    trip: [
      { id: "tripdone00000001", status: "COMPLETED", routeId: "routeknlvja0001", scheduledDepartureAt: at(-8 * HOUR), boardingStopId: null },
      { id: "triprunning00001", status: "RUNNING", routeId: "routeknlvja0001", scheduledDepartureAt: at(-HOUR) },
      { id: "tripsoon00000001", status: "SCHEDULED", routeId: "routeknlvja0001", scheduledDepartureAt: at(3 * HOUR) },
    ],
    route: [{ id: "routeknlvja0001", nameEn: "Kurnool to Vijayawada", nameTe: "కర్నూలు నుండి విజయవాడ" }],
    routeStop: [{ routeId: "routeknlvja0001", stopId: "stopknl0000001", minutesFromOrigin: 0 }],
    booking: [{ id: "bkg00000000001", userId: ravi, tripId: "tripsoon00000001", boardingStopId: "stopknl0000001" }],
    bookingPassenger: [
      { id: "psg00000000001", bookingId: "bkg00000000001", seatNo: "18" },
      { id: "psg00000000002", bookingId: "bkg00000000001", seatNo: "19" },
    ],
    ticket: [],
    passType: [{ id: "passtypeweekly01", kind: "WEEKLY", nameEn: "Weekly Pass", nameTe: "వారపు పాస్" }],
    pass: [],
    notification: [],
    setting: [],
    auditLog: [],
  };
}

describe("Notifications and expiry jobs (Day 9)", () => {
  let app: NestExpressApplication;
  let tokens: Record<string, string>;
  const tables: Tables = {};
  const redis = createFakeRedis();
  const queued: { name: string; data: any; opts: any }[] = [];
  const sent: { to: string; subject: string; body: string; html?: string }[] = [];
  const events: any[] = [];

  const byId = (model: string, id: unknown) => (tables[model] ?? []).find((r) => r.id === id) ?? null;
  const routeOf = (routeId: string) => ({ ...byId("route", routeId), routeStops: tables.routeStop!.filter((rs) => rs.routeId === routeId) });
  const prisma = createMemoryPrisma(tables, {
    ticket: { trip: (t) => byId("trip", t.tripId), route: (t) => byId("route", byId("trip", t.tripId)?.routeId) },
    booking: {
      passengers: (b) => tables.bookingPassenger!.filter((p) => p.bookingId === b.id),
      trip: (b) => {
        const trip = byId("trip", b.tripId);
        return trip && { ...trip, route: routeOf(trip.routeId) };
      },
    },
    pass: { passType: (p) => byId("passType", p.passTypeId) },
    notification: { user: (n) => byId("user", n.userId) },
  });

  const ticket = (id: string, fields: Record<string, unknown>) => ({
    id,
    holderUserId: ravi,
    tripId: "tripsoon00000001",
    status: "BOOKED",
    expiresAt: at(DAY),
    validUntil: null,
    scannedAt: null,
    usedAt: null,
    version: 1,
    ...fields,
  });
  const pass = (id: string, fields: Record<string, unknown>) => ({
    id,
    userId: ravi,
    passTypeId: "passtypeweekly01",
    status: "READY",
    createdAt: at(-DAY),
    validUntil: null,
    ...fields,
  });

  let service: NotificationsService;
  let expiry: StatusExpiryService;
  let emails: NotificationEmailService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(RedisService)
      .useValue(redis)
      .overrideProvider(getQueueToken(QUEUES.NOTIFICATIONS))
      .useValue({ add: async (name: string, data: any, opts: any) => void queued.push({ name, data, opts }) })
      .overrideProvider(getQueueToken(QUEUES.EXPIRY))
      .useValue({ add: async () => ({}), remove: async () => 1 })
      .overrideProvider(EMAIL_PROVIDER)
      .useValue({ sendEmail: async (to: string, subject: string, body: string, html?: string) => void sent.push({ to, subject, body, html }) })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureHttpApp(app);
    await app.init();
    const auth = moduleRef.get(AuthService) as any;
    const citizen = [{ role: "CITIZEN", depotId: null, districtId: null }];
    tokens = { ravi: await auth.generateAccessToken(ravi, citizen), lakshmi: await auth.generateAccessToken(lakshmi, citizen) };
    service = moduleRef.get(NotificationsService);
    emails = moduleRef.get(NotificationEmailService);
    // The expiry service lives in the worker; build it here with the same pieces
    expiry = new StatusExpiryService(prisma, moduleRef.get(DomainEventsService), service);
    moduleRef.get(DomainEventsService).on("ticket.status", (e) => void events.push(e));
  });

  beforeEach(() => {
    for (const key of Object.keys(tables)) delete tables[key];
    Object.assign(tables, freshTables());
    queued.length = 0;
    sent.length = 0;
    events.length = 0;
    redis.store.clear();
  });

  afterAll(async () => {
    await app.close();
  });

  const flush = () => new Promise((resolve) => setTimeout(resolve, 20));
  const get = (path: string, who = "ravi") => request(app.getHttpServer()).get(`/api/v1${path}`).set("Authorization", `Bearer ${tokens[who]}`);
  const post = (path: string, who = "ravi") => request(app.getHttpServer()).post(`/api/v1${path}`).set("Authorization", `Bearer ${tokens[who]}`);

  describe("notify and email", () => {
    it("writes the row and queues one email job per notification for a user with an email", async () => {
      const dto = await service.notify(ravi, "TICKET_ACTIVATED", {}, "/tickets/abc");
      expect(tables.notification).toHaveLength(1);
      expect(queued).toEqual([{ name: "send-email", data: { notificationId: dto.id }, opts: expect.objectContaining({ jobId: `email-${dto.id}` }) }]);

      await service.notify("usernoemail0001", "TICKET_ACTIVATED", {}, null);
      expect(tables.notification).toHaveLength(2);
      expect(queued).toHaveLength(1);
    });

    it("the worker renders in the user's language, sends once and marks emailedAt", async () => {
      const dto = await service.notify(
        lakshmi,
        "TICKET_RECEIVED",
        { sender: "Citizen Ravi", routeEn: "Kurnool to Vijayawada", routeTe: "కర్నూలు నుండి విజయవాడ" },
        "/tickets/abc",
      );
      expect(await emails.send(dto.id, NOW)).toBe("SENT");
      expect(sent).toHaveLength(1);
      expect(sent[0]!.to).toBe("citizen2@aptransit.test");
      expect(sent[0]!.body).toContain("కర్నూలు నుండి విజయవాడ");
      expect(sent[0]!.html).toContain('lang="te"');
      expect(sent[0]!.html).toContain("http://localhost:3000/tickets/abc");
      expect(tables.notification![0]!.emailedAt).toEqual(NOW);
      expect(await emails.send(dto.id, NOW)).toBe("SKIPPED");
      expect(sent).toHaveLength(1);
    });

    it("every type renders in en and te without a missing placeholder", () => {
      const stored = {
        routeEn: "Kurnool to Vijayawada",
        routeTe: "కర్నూలు నుండి విజయవాడ",
        departureAt: NOW.toISOString(),
        validUntil: NOW.toISOString(),
        seat: "18",
        sender: "Ravi",
        stop: "Nandyal",
        minutes: 12,
        busNo: "AP 39 Z 1234",
        message: "Diversion near Nandyal",
        passNameEn: "Weekly Pass",
        passNameTe: "వారపు పాస్",
        code: "CMP-ABC123",
        status: "IN_REVIEW",
      };
      for (const locale of ["en", "te"] as const) {
        for (const type of NotificationType.options) {
          const mail = renderNotificationEmail(locale, type, stored, "/updates", "https://aptransit.example");
          expect(`${mail.subject} ${mail.text}`).not.toMatch(/[{}]/);
          expect(mail.html).toContain("https://aptransit.example/updates");
        }
      }
    });

    it("escapes HTML in params", () => {
      const mail = renderNotificationEmail("en", "ROUTE_UPDATE", { message: "<script>x</script>" }, null, "https://a.example");
      expect(mail.html).not.toContain("<script>");
      expect(mail.html).toContain("&lt;script&gt;");
    });
  });

  describe("event subscribers", () => {
    it("booking.confirmed gives one BOOKING_CONFIRMED per booking with route, time and seats", async () => {
      app.get(DomainEventsService).publish("booking.confirmed", { bookingId: "bkg00000000001", userId: ravi, tripId: "tripsoon00000001", ticketIds: ["t1", "t2"] });
      await flush();
      expect(tables.notification).toHaveLength(1);
      expect(tables.notification![0]).toMatchObject({
        userId: ravi,
        type: "BOOKING_CONFIRMED",
        link: "/tickets",
        params: { routeEn: "Kurnool to Vijayawada", routeTe: "కర్నూలు నుండి విజయవాడ", seat: "18, 19", departureAt: at(3 * HOUR).toISOString() },
      });
    });

    it("ticket ACTIVE gives TICKET_ACTIVATED; other changes give nothing", async () => {
      const bus = app.get(DomainEventsService);
      bus.publish("ticket.status", { ticketId: "tkt1", holderUserId: ravi, from: "BOOKED", to: "ACTIVE" });
      bus.publish("ticket.status", { ticketId: "tkt1", holderUserId: ravi, from: "BOOKED", to: "CANCELLED" });
      await flush();
      expect(tables.notification!.map((n) => n.type)).toEqual(["TICKET_ACTIVATED"]);
      expect(tables.notification![0]!.link).toBe("/tickets/tkt1");
    });

    it("ticket.transferred gives TICKET_RECEIVED to the recipient with the sender's name", async () => {
      tables.ticket!.push(ticket("tktgift0000001", {}));
      app.get(DomainEventsService).publish("ticket.transferred", { ticketId: "tktgift0000001", fromUserId: ravi, toUserId: lakshmi, seatNo: "18" });
      await flush();
      expect(tables.notification).toEqual([
        expect.objectContaining({ userId: lakshmi, type: "TICKET_RECEIVED", params: expect.objectContaining({ sender: "Citizen Ravi", routeEn: "Kurnool to Vijayawada" }) }),
      ]);
    });
  });

  describe("endpoints", () => {
    it("lists newest first with a cursor, counts unread, reads one and all, owner only", async () => {
      for (let i = 0; i < 3; i++) {
        tables.notification!.push({ id: `ntf0000000000${i}`, userId: ravi, type: "TICKET_ACTIVATED", params: {}, link: null, readAt: null, emailedAt: null, createdAt: at(i * MIN) });
      }
      tables.notification!.push({ id: "ntfother000001", userId: lakshmi, type: "TICKET_ACTIVATED", params: {}, link: null, readAt: null, emailedAt: null, createdAt: NOW });

      const first = NotificationsPage.parse((await get("/notifications?limit=2").expect(200)).body);
      expect(first.items.map((n) => n.id)).toEqual(["ntf00000000002", "ntf00000000001"]);
      expect(first.nextCursor).toBe("ntf00000000001");
      const second = NotificationsPage.parse((await get(`/notifications?limit=2&cursor=${first.nextCursor}`).expect(200)).body);
      expect(second.items.map((n) => n.id)).toEqual(["ntf00000000000"]);
      expect(second.nextCursor).toBeNull();

      expect((await get("/notifications/unread-count").expect(200)).body).toEqual({ count: 3 });
      await post("/notifications/ntf00000000001/read").expect(204);
      expect((await get("/notifications/unread-count").expect(200)).body).toEqual({ count: 2 });
      await post("/notifications/ntfother000001/read").expect(404);
      await post("/notifications/read-all").expect(204);
      expect((await get("/notifications/unread-count").expect(200)).body).toEqual({ count: 0 });
      expect((await get("/notifications/unread-count", "lakshmi").expect(200)).body).toEqual({ count: 1 });
    });
  });

  describe("status expiry (frozen time)", () => {
    it("a. BOOKED tickets whose activation window closed expire", async () => {
      tables.ticket!.push(ticket("tktold00000001", { expiresAt: at(-MIN) }), ticket("tktopen0000001", { expiresAt: at(MIN) }));
      const counts = await expiry.runAll(NOW);
      expect(counts.ticketsBookedExpired).toBe(1);
      expect(byId("ticket", "tktold00000001")).toMatchObject({ status: "EXPIRED", version: 2 });
      expect(byId("ticket", "tktopen0000001")!.status).toBe("BOOKED");
      expect(events).toEqual([{ ticketId: "tktold00000001", holderUserId: ravi, from: "BOOKED", to: "EXPIRED" }]);
    });

    it("b. ACTIVE tickets past validUntil and never scanned expire", async () => {
      tables.ticket!.push(ticket("tktact00000001", { status: "ACTIVE", validUntil: at(-MIN) }), ticket("tktact00000002", { status: "ACTIVE", validUntil: at(HOUR) }));
      expect((await expiry.runAll(NOW)).ticketsActiveExpired).toBe(1);
      expect(byId("ticket", "tktact00000001")!.status).toBe("EXPIRED");
      expect(byId("ticket", "tktact00000002")!.status).toBe("ACTIVE");
    });

    it("c. SCANNED tickets past validUntil, or on a completed trip, become USED", async () => {
      tables.ticket!.push(
        ticket("tktscn00000001", { status: "SCANNED", validUntil: at(-MIN), scannedAt: at(-HOUR) }),
        ticket("tktscn00000002", { status: "SCANNED", validUntil: at(HOUR), scannedAt: at(-HOUR), tripId: "tripdone00000001" }),
        ticket("tktscn00000003", { status: "SCANNED", validUntil: at(HOUR), scannedAt: at(-HOUR), tripId: "triprunning00001" }),
      );
      expect((await expiry.runAll(NOW)).ticketsScannedUsed).toBe(2);
      expect(byId("ticket", "tktscn00000001")).toMatchObject({ status: "USED", usedAt: NOW });
      expect(byId("ticket", "tktscn00000002")!.status).toBe("USED");
      expect(byId("ticket", "tktscn00000003")!.status).toBe("SCANNED");
    });

    it("d. READY passes not activated in 30 days and ACTIVE passes past validUntil expire", async () => {
      tables.pass!.push(
        pass("passready00001", { createdAt: at(-31 * DAY) }),
        pass("passready00002", { createdAt: at(-29 * DAY) }),
        pass("passact000001", { status: "ACTIVE", validUntil: at(-MIN) }),
      );
      const counts = await expiry.runAll(NOW);
      expect(counts).toMatchObject({ passesReadyExpired: 1, passesActiveExpired: 1 });
      expect(byId("pass", "passready00001")!.status).toBe("EXPIRED");
      expect(byId("pass", "passready00002")!.status).toBe("READY");
      expect(byId("pass", "passact000001")!.status).toBe("EXPIRED");
    });

    it("e. PASS_EXPIRING is sent once, inside 24 hours of validUntil", async () => {
      tables.pass!.push(pass("passsoon00001", { status: "ACTIVE", validUntil: at(20 * HOUR) }), pass("passlater0001", { status: "ACTIVE", validUntil: at(3 * DAY) }));
      expect((await expiry.runAll(NOW)).passesExpiringNotified).toBe(1);
      expect((await expiry.runAll(NOW)).passesExpiringNotified).toBe(0);
      expect(tables.notification).toEqual([
        expect.objectContaining({ userId: ravi, type: "PASS_EXPIRING", link: "/passes?pass=passsoon00001", params: expect.objectContaining({ passNameEn: "Weekly Pass" }) }),
      ]);
    });

    it("f. unpaid passes older than 30 min are cancelled", async () => {
      tables.pass!.push(pass("passunpaid001", { status: "PENDING_PAYMENT", createdAt: at(-31 * MIN) }), pass("passunpaid002", { status: "PENDING_PAYMENT", createdAt: at(-5 * MIN) }));
      expect((await expiry.runAll(NOW)).passesPendingCancelled).toBe(1);
      expect(byId("pass", "passunpaid001")!.status).toBe("CANCELLED");
      expect(byId("pass", "passunpaid002")!.status).toBe("PENDING_PAYMENT");
    });
  });

  describe("worker heartbeat", () => {
    it("health says worker ok after a heartbeat and stale without one", async () => {
      expect(await readWorkerState(redis.client)).toBe("stale");
      expect((await request(app.getHttpServer()).get("/api/v1/health")).body.worker).toBe("stale");
      await writeHeartbeat(redis.client as any, NOW);
      expect(redis.store.get(WORKER_HEARTBEAT_KEY)).toBe(NOW.toISOString());
      expect((await request(app.getHttpServer()).get("/api/v1/health")).body.worker).toBe("ok");
    });
  });
});
