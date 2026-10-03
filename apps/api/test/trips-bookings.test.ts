/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  BookingDto,
  ErrorResponse,
  FareDto,
  formatIstDate,
  SeatMapDto,
  TripDetailDto,
} from "@aptransit/shared";
import { getQueueToken } from "@nestjs/bullmq";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { AuthService } from "../src/modules/auth/auth.service";
import { configureHttpApp } from "../src/http-app";
import { QUEUES } from "../src/modules/queue/queue.constants";
import { PrismaService } from "../src/prisma/prisma.service";
import { RedisService } from "../src/redis/redis.service";

describe("Trips and Bookings endpoints (Day 5)", () => {
  let app: NestExpressApplication;
  let authService: AuthService;
  let userToken: string;
  const userId = "usertestcitizen1";

  // In-memory mock tables
  const redisStore = new Map<string, string>();
  const bookings: any[] = [];
  const bookingPassengers: any[] = [];
  const tickets: any[] = [];
  const settings = new Map<string, any>([
    ["booking.maxPassengers", 6],
    ["booking.daysAhead", 30],
    ["booking.closeMinutesBefore", 10],
    ["booking.holdMinutes", 10],
  ]);

  const mockTripId = "tripknlvja010630";
  const fromStopId = "stopknl0000";
  const toStopId = "stopvja0000";
  const busTypeId = "bustypeexpress00";
  const today = formatIstDate(new Date());

  const mockTrip = {
    id: mockTripId,
    code: "TRP-KNL-VJA-0630",
    serviceDate: new Date(`${today}T00:00:00.000Z`),
    scheduledDepartureAt: new Date(Date.now() + 3600 * 1000 * 4), // 4 hours in future
    scheduledArrivalAt: new Date(Date.now() + 3600 * 1000 * 9),
    status: "SCHEDULED",
    delayMinutes: 0,
    hasOpenIncident: false,
    busTypeId,
    busType: {
      id: busTypeId,
      serviceType: "EXPRESS",
      nameEn: "Express",
      nameTe: "ఎక్స్‌ప్రెస్",
      isAc: false,
      totalSeats: 40,
      freeTravelEligible: false,
      seatLayout: {
        rows: 10,
        columns: 4,
        aisleIndex: 2,
        labels: Array.from({ length: 40 }, (_, i) => String(i + 1)),
        blockedCells: [],
      },
    },
    route: {
      id: "routeknlvja0100",
      code: "KNL-VJA-01",
      nameEn: "Kurnool to Vijayawada",
      nameTe: "కర్నూలు to విజయవాడ",
      distanceKm: 340,
      polyline: "mock_polyline",
      originStop: { id: fromStopId, nameEn: "Kurnool", nameTe: "కర్నూలు" },
      destinationStop: { id: toStopId, nameEn: "Vijayawada", nameTe: "విజయవాడ" },
      routeStops: [
        {
          stopId: fromStopId,
          seq: 1,
          kmFromOrigin: 0,
          minutesFromOrigin: 0,
          isBoarding: true,
          isDropping: false,
          stop: { id: fromStopId, code: "KNL", nameEn: "Kurnool", nameTe: "కర్నూలు", busStandId: "standknl000", lat: 15.8, lng: 78.0 },
        },
        {
          stopId: toStopId,
          seq: 2,
          kmFromOrigin: 340,
          minutesFromOrigin: 340,
          isBoarding: false,
          isDropping: true,
          stop: { id: toStopId, code: "VJA", nameEn: "Vijayawada", nameTe: "విజయవాడ", busStandId: "standvja000", lat: 16.5, lng: 80.6 },
        },
      ],
    },
    assignments: [
      {
        endedAt: null,
        bus: { regNo: "AP 39 Z 1234" },
      },
    ],
  };

  const mockFareRule = {
    id: "fareruleexp000",
    busTypeId,
    baseFarePaise: 4000,
    perKmPaise: 140,
    minFarePaise: 5000,
    reservationFeePaise: 2500,
    validFrom: new Date("2026-01-01"),
    validTo: null,
  };

  const mockRefundPolicy = {
    id: "refundpolicy000",
    name: "Standard",
    isActive: true,
    validFrom: new Date("2026-01-01"),
    tiers: [
      { minHoursBefore: 24, percent: 90 },
      { minHoursBefore: 12, percent: 75 },
      { minHoursBefore: 1, percent: 50 },
      { minHoursBefore: 0, percent: 0 },
    ],
  };

  beforeAll(async () => {
    const mockPrisma = {
      $queryRaw: async () => [1],
      $transaction: async (cb: any) => {
        return cb(mockPrisma);
      },
      trip: {
        findUnique: async ({ where }: any) => {
          if (where.id === mockTripId) return mockTrip;
          return null;
        },
        findMany: async () => [mockTrip],
      },
      ticket: {
        count: async ({ where }: any) => {
          return tickets.filter((t) => t.tripId === where.tripId && where.status.in.includes(t.status)).length;
        },
        findMany: async ({ where }: any) => {
          return tickets.filter((t) => {
            if (where.tripId && t.tripId !== where.tripId) return false;
            if (where.status?.in && !where.status.in.includes(t.status)) return false;
            if (where.seatNo?.in && !where.seatNo.in.includes(t.seatNo)) return false;
            return true;
          });
        },
      },
      fareRule: {
        findFirst: async () => mockFareRule,
      },
      refundPolicy: {
        findFirst: async () => mockRefundPolicy,
      },
      setting: {
        findUnique: async ({ where }: any) => {
          if (settings.has(where.key)) return { value: settings.get(where.key) };
          return null;
        },
      },
      booking: {
        create: async ({ data }: any) => {
          const id = `bkg${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
          const passengers = data.passengers?.create?.map((p: any) => ({
            id: `bp${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
            bookingId: id,
            ...p,
          })) ?? [];
          const record = {
            id,
            code: data.code,
            userId: data.userId,
            tripId: data.tripId,
            boardingStopId: data.boardingStopId,
            droppingStopId: data.droppingStopId,
            status: data.status,
            totalPaise: data.totalPaise,
            holdExpiresAt: data.holdExpiresAt,
            createdAt: new Date(),
            updatedAt: new Date(),
            passengers: passengers,
          };
          bookings.push(record);
          bookingPassengers.push(...passengers);
          return record;
        },
        findUnique: async ({ where }: any) => {
          const b = bookings.find((x) => x.id === where.id);
          if (!b) return null;
          return {
            ...b,
            passengers: bookingPassengers.filter((p) => p.bookingId === b.id),
          };
        },
        update: async ({ where, data }: any) => {
          const b = bookings.find((x) => x.id === where.id);
          if (b) Object.assign(b, data);
          return b;
        },
      },
      user: {
        findUnique: async ({ where }: any) => {
          if (where.id === userId) {
            return {
              id: userId,
              phone: "9876543210",
              email: "citizen@example.com",
              name: "Citizen",
              preferredLocale: "en",
              roles: [{ role: "CITIZEN", depotId: null, districtId: null }],
            };
          }
          return null;
        },
      },
      userRole: {
        findMany: async () => [{ role: "CITIZEN", depotId: null, districtId: null }],
      },
      onModuleDestroy: async () => undefined,
    };

    const mockRedis = {
      client: {
        status: "ready",
        ping: async () => "PONG",
        get: async (key: string) => redisStore.get(key) ?? null,
        set: async (key: string, value: string, ...args: any[]) => {
          if (args.includes("NX") && redisStore.has(key)) {
            return null;
          }
          redisStore.set(key, value);
          return "OK";
        },
        mget: async (keys: string[]) => keys.map((k) => redisStore.get(k) ?? null),
        del: async (...keys: string[]) => {
          let count = 0;
          for (const k of keys) {
            if (redisStore.delete(k)) count++;
          }
          return count;
        },
        incrby: async (key: string, amount: number) => {
          const curr = parseInt(redisStore.get(key) ?? "0", 10);
          const next = curr + amount;
          redisStore.set(key, String(next));
          return next;
        },
        decrby: async (key: string, amount: number) => {
          const curr = parseInt(redisStore.get(key) ?? "0", 10);
          const next = Math.max(0, curr - amount);
          redisStore.set(key, String(next));
          return next;
        },
        expire: async () => 1,
        eval: async (_script: string, _keys: number, key: string, windowMs: string) => {
          const val = Number(redisStore.get(key) ?? 0) + 1;
          redisStore.set(key, String(val));
          return [val, Number(windowMs)];
        },
      },
      onModuleDestroy: async () => undefined,
    };

    const mockQueue = {
      add: async () => ({ id: "mock_job_id" }),
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(RedisService)
      .useValue(mockRedis)
      .overrideProvider(getQueueToken(QUEUES.EXPIRY))
      .useValue(mockQueue)
      .overrideProvider(getQueueToken(QUEUES.MAINTENANCE))
      .useValue(mockQueue)
      .overrideProvider(getQueueToken(QUEUES.NOTIFICATIONS))
      .useValue(mockQueue)
      .overrideProvider(getQueueToken(QUEUES.ROLLUPS))
      .useValue(mockQueue)
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureHttpApp(app);
    await app.init();

    authService = moduleRef.get(AuthService);
    userToken = await (authService as any).generateAccessToken(userId, [
      { role: "CITIZEN", depotId: null, districtId: null },
    ]);
  });

  beforeEach(() => {
    redisStore.clear();
    bookings.length = 0;
    bookingPassengers.length = 0;
    tickets.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /trips/:id", () => {
    it("returns full trip details with boarding, dropping and seats left", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/trips/${mockTripId}?from=${fromStopId}&to=${toStopId}`)
        .expect(200);

      const parsed = TripDetailDto.safeParse(res.body);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.tripId).toBe(mockTripId);
        expect(parsed.data.busRegNo).toBe("AP 39 Z 1234");
        expect(parsed.data.boardingPoints.length).toBe(1);
        expect(parsed.data.droppingPoints.length).toBe(1);
        expect(parsed.data.seatsLeft).toBe(40);
        expect(parsed.data.farePaise).toBeGreaterThan(0);
      }
    });

    it("returns 404 for nonexistent trip", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/trips/tripunknown00")
        .expect(404);

      const parsed = ErrorResponse.safeParse(res.body);
      expect(parsed.success).toBe(true);
      expect(parsed.data?.error.code).toBe("NOT_FOUND");
    });
  });

  describe("GET /trips/:id/seats", () => {
    it("returns seat layout and state for all seats", async () => {
      // Set seat 5 as held in Redis
      redisStore.set(`hold:${mockTripId}:5`, "some_booking");

      const res = await request(app.getHttpServer())
        .get(`/api/v1/trips/${mockTripId}/seats`)
        .expect(200);

      const parsed = SeatMapDto.safeParse(res.body);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.seats.length).toBe(40);
        const seat5 = parsed.data.seats.find((s) => s.seatNo === "5");
        expect(seat5?.state).toBe("HELD");
        const seat1 = parsed.data.seats.find((s) => s.seatNo === "1");
        expect(seat1?.state).toBe("FREE");
      }
    });
  });

  describe("GET /trips/:id/fare", () => {
    it("computes fare breakdown and refund tiers", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/trips/${mockTripId}/fare?from=${fromStopId}&to=${toStopId}`)
        .expect(200);

      const parsed = FareDto.safeParse(res.body);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.distanceKm).toBe(340);
        expect(parsed.data.totalPaise).toBe(parsed.data.basePaise + parsed.data.reservationFeePaise);
        expect(parsed.data.refundTiers.length).toBe(4);
      }
    });
  });

  describe("POST /bookings (concurrency and holds)", () => {
    const bookingPayload = {
      tripId: mockTripId,
      boardingStopId: fromStopId,
      droppingStopId: toStopId,
      passengers: [
        { name: "Passenger One", age: 30, gender: "M", seatNo: "12" },
      ],
    };

    it("creates a booking and sets Redis seat hold", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/bookings")
        .set("Authorization", `Bearer ${userToken}`)
        .send(bookingPayload)
        .expect(201);

      const parsed = BookingDto.safeParse(res.body);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.status).toBe("PENDING_PAYMENT");
        expect(parsed.data.passengers[0]?.seatNo).toBe("12");
        expect(redisStore.get(`hold:${mockTripId}:12`)).toBe(parsed.data.id);
      }
    });

    it("concurrency: two parallel bookings for the same seat: exactly 1 succeeds, 1 gets SEAT_TAKEN", async () => {
      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post("/api/v1/bookings")
          .set("Authorization", `Bearer ${userToken}`)
          .send({
            tripId: mockTripId,
            boardingStopId: fromStopId,
            droppingStopId: toStopId,
            passengers: [{ name: "User A", age: 25, gender: "F", seatNo: "18" }],
          }),
        request(app.getHttpServer())
          .post("/api/v1/bookings")
          .set("Authorization", `Bearer ${userToken}`)
          .send({
            tripId: mockTripId,
            boardingStopId: fromStopId,
            droppingStopId: toStopId,
            passengers: [{ name: "User B", age: 28, gender: "M", seatNo: "18" }],
          }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 409]);

      const failRes = res1.status === 409 ? res1 : res2;
      expect(failRes.body.error.code).toBe("SEAT_TAKEN");
    });

    it("DELETE /bookings/:id cancels pending booking and releases seat holds", async () => {
      const createRes = await request(app.getHttpServer())
        .post("/api/v1/bookings")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          tripId: mockTripId,
          boardingStopId: fromStopId,
          droppingStopId: toStopId,
          passengers: [{ name: "To Cancel", age: 35, gender: "M", seatNo: "22" }],
        })
        .expect(201);

      const bookingId = createRes.body.id;
      expect(redisStore.has(`hold:${mockTripId}:22`)).toBe(true);

      await request(app.getHttpServer())
        .delete(`/api/v1/bookings/${bookingId}`)
        .set("Authorization", `Bearer ${userToken}`)
        .expect(204);

      expect(redisStore.has(`hold:${mockTripId}:22`)).toBe(false);

      const checkBooking = await request(app.getHttpServer())
        .get(`/api/v1/bookings/${bookingId}`)
        .set("Authorization", `Bearer ${userToken}`)
        .expect(200);

      expect(checkBooking.body.status).toBe("CANCELLED");
    });

    it("rejects booking with invalid seat or dropping before boarding", async () => {
      const badStopRes = await request(app.getHttpServer())
        .post("/api/v1/bookings")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          tripId: mockTripId,
          boardingStopId: toStopId, // Swapped
          droppingStopId: fromStopId,
          passengers: [{ name: "Test", age: 20, gender: "M", seatNo: "1" }],
        })
        .expect(400);

      expect(badStopRes.body.error.code).toBe("VALIDATION_FAILED");

      const badSeatRes = await request(app.getHttpServer())
        .post("/api/v1/bookings")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          tripId: mockTripId,
          boardingStopId: fromStopId,
          droppingStopId: toStopId,
          passengers: [{ name: "Test", age: 20, gender: "M", seatNo: "999" }], // seat 999 does not exist
        })
        .expect(400);

      expect(badSeatRes.body.error.code).toBe("VALIDATION_FAILED");
    });
  });
});
