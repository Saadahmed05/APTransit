import {
  BusStandsResponse,
  DistrictsResponse,
  ErrorResponse,
  formatIstDate,
  formatIstTime,
  PlacesSearchResponse,
  RouteDto,
  SearchTripsResponse,
  StatesResponse,
  TimetableDto,
} from "@aptransit/shared";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureHttpApp } from "../src/http-app";
import { NetworkRepository } from "../src/modules/network/network.repository";
import { PrismaService } from "../src/prisma/prisma.service";
import { RedisService } from "../src/redis/redis.service";
import { AP_STATE_ID } from "../prisma/seed-data";
import { busStandId, districtId, FakeNetworkRepository, routeId, stopId } from "./network-fixture";

const DAY_MS = 24 * 60 * 60 * 1000;
const today = formatIstDate(new Date());
const tomorrow = formatIstDate(new Date(Date.now() + DAY_MS));

describe("Network and search endpoints (docs/06, Day 4)", () => {
  let app: NestExpressApplication;
  let repo: FakeNetworkRepository;
  const redisStore = new Map<string, string>();

  beforeAll(async () => {
    repo = new FakeNetworkRepository({ dates: [today, tomorrow] });
    const mockRedis = {
      client: {
        status: "ready",
        ping: async () => "PONG",
        eval: async (_script: string, _keys: number, key: string, windowMs: string) => {
          const val = Number(redisStore.get(key) ?? 0) + 1;
          redisStore.set(key, String(val));
          return [val, Number(windowMs)];
        },
      },
      onModuleDestroy: async () => undefined,
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: async () => [1], onModuleDestroy: async () => undefined })
      .overrideProvider(RedisService)
      .useValue(mockRedis)
      .overrideProvider(NetworkRepository)
      .useValue(repo)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureHttpApp(app);
    await app.init();
  });

  // Every test starts with fresh rate limit windows
  beforeEach(() => redisStore.clear());

  afterAll(async () => {
    await app?.close();
  });

  const get = (path: string) => request(app.getHttpServer()).get(`/api/v1${path}`);

  describe("GET /places/search", () => {
    it("finds Kurnool from English input, bus stand first, with the district", async () => {
      const res = await get("/places/search?q=kurn");
      expect(res.status).toBe(200);
      const places = PlacesSearchResponse.parse(res.body);
      expect(places[0]).toEqual({
        id: stopId("KNL"),
        kind: "BUS_STAND",
        nameEn: "Kurnool Bus Stand",
        nameTe: "కర్నూలు బస్ స్టాండ్",
        districtNameEn: "Kurnool",
        districtNameTe: "కర్నూలు",
      });
    });

    it("finds Kurnool from Telugu input", async () => {
      const res = await get(`/places/search?q=${encodeURIComponent("కర్నూ")}`);
      expect(res.status).toBe(200);
      expect(res.body[0].id).toBe(stopId("KNL"));
    });

    it("ranks bus stands before plain stops", async () => {
      const places = PlacesSearchResponse.parse((await get("/places/search?q=ur")).body);
      const kinds = places.map((p) => p.kind);
      expect(kinds).toContain("STOP");
      expect(kinds.indexOf("STOP")).toBeGreaterThan(kinds.lastIndexOf("BUS_STAND"));
    });

    it("honours the limit and caches repeated queries", async () => {
      const before = repo.calls.searchStops;
      const first = await get("/places/search?q=an&limit=2");
      expect(first.body).toHaveLength(2);
      await get("/places/search?q=AN&limit=2");
      expect(repo.calls.searchStops).toBe(before + 1);
    });

    it("returns an empty list when nothing matches", async () => {
      const res = await get("/places/search?q=zzzz");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("needs at least 2 characters", async () => {
      const res = await get("/places/search?q=k");
      expect(res.status).toBe(400);
      expect(ErrorResponse.parse(res.body).error.code).toBe("VALIDATION_FAILED");
    });

    it("is limited to 60 per minute (docs/12)", async () => {
      const res = await get("/places/search?q=kurn");
      expect(res.headers["x-ratelimit-limit"]).toBe("60");
    });
  });

  it("GET /places/nearby lists the closest stops first (D-042)", async () => {
    const res = await get("/places/nearby?lat=15.67&lng=78.11&limit=3");
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ id: stopId("ORV"), distanceKm: 0 });
    expect(res.body).toHaveLength(3);
    expect((await get("/places/nearby?lat=200&lng=1")).status).toBe(400);
  });

  describe("districts and bus stands", () => {
    it("lists districts with bus stand counts", async () => {
      const res = await get("/districts");
      expect(res.status).toBe(200);
      const districts = DistrictsResponse.parse(res.body);
      expect(districts).toHaveLength(12);
      expect(districts.find((d) => d.code === "NDL")?.busStandCount).toBe(2);
      expect(districts.every((d) => d.stateId === AP_STATE_ID)).toBe(true);
      expect(res.headers["x-ratelimit-limit"]).toBe("120");
    });

    it("lists states with their map view, public (D-034)", async () => {
      const res = await get("/states");
      expect(res.status).toBe(200);
      expect(StatesResponse.parse(res.body)).toEqual([
        expect.objectContaining({ id: AP_STATE_ID, code: "AP", bounds: [76.7, 12.6, 84.8, 19.95], center: { lat: 16, lng: 78 }, zoom: 7 }),
      ]);
    });

    it("lists bus stands of a district with route counts", async () => {
      const res = await get(`/districts/${districtId("NDL")}/bus-stands`);
      expect(res.status).toBe(200);
      expect(BusStandsResponse.parse(res.body)).toEqual([
        { id: busStandId("DHN"), nameEn: "Dhone", nameTe: "డోన్", routeCount: 3 },
        {
          id: busStandId("NDL"),
          nameEn: "Nandyal Bus Stand",
          nameTe: "నంద్యాల బస్ స్టాండ్",
          routeCount: 6,
        },
      ]);
    });

    it("lists routes leaving a bus stand with service types", async () => {
      const res = await get(`/bus-stands/${busStandId("KNL")}/routes`);
      expect(res.status).toBe(200);
      expect(res.body.map((r: { code: string }) => r.code)).toEqual([
        // D-046: Kurnool city lines and local routes to Adoni and Atmakur
        "KCC-01",
        "KCL-01",
        "KCM-01",
        "KHL-01",
        "KNL-ADN-01",
        "KNL-ATK-01",
        "KNL-ATP-01",
        "KNL-NDL-01",
        "KNL-TPT-01",
        "KNL-VJA-01",
        "KOT-01",
        "KSA-01",
        "KSB-01",
        "KSC-01",
        "KSD-01",
      ]);
      const vja = res.body.find((r: { code: string }) => r.code === "KNL-VJA-01");
      expect(vja.destination.nameEn).toBe("Vijayawada PNBS");
      expect(vja.serviceTypes).toEqual(["AMARAVATI_AC", "EXPRESS", "SUPER_LUXURY", "ULTRA_DELUXE"]);
    });

    it("answers 404 for an unknown district or bus stand", async () => {
      expect((await get("/districts/distunknown00/bus-stands")).body.error.code).toBe("NOT_FOUND");
      expect((await get("/bus-stands/standunknown0/routes")).status).toBe(404);
    });

    it("refuses a malformed id", async () => {
      const res = await get("/districts/..%2Fadmin/bus-stands");
      expect([400, 404]).toContain(res.status);
    });
  });

  describe("GET /routes/:id and timetable", () => {
    it("returns the route with ordered stops", async () => {
      const res = await get(`/routes/${routeId("KNL-VJA-01")}`);
      expect(res.status).toBe(200);
      const route = RouteDto.parse(res.body);
      expect(route.stops.map((s) => s.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(route.stops[0]?.nameEn).toBe("Kurnool Bus Stand");
      expect(route.stops[7]).toMatchObject({
        nameEn: "Vijayawada PNBS",
        kmFromOrigin: 365,
        minutesFromOrigin: 340,
      });
    });

    it("answers 404 for an unknown route", async () => {
      const res = await get("/routes/routeunknown00");
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("gives first, last, next and frequency for a date", async () => {
      const res = await get(`/routes/${routeId("KNL-NDL-01")}/timetable?date=${tomorrow}`);
      expect(res.status).toBe(200);
      const tt = TimetableDto.parse(res.body);
      expect(tt.date).toBe(tomorrow);
      expect(tt.firstDepartureLocal).toBe("05:00");
      expect(tt.lastDepartureLocal).toBe("23:00");
      // Four Express, four Ultra Deluxe and four Super Luxury every hour (a bus every 5 min), Pallevelugu every 15 min
      expect(tt.frequencyMin).toBe(5);
      expect(tt.trips).toHaveLength(18 * 12 + 73);
      expect(tt.nextDepartureAt).toBe(new Date(`${tomorrow}T05:00:00+05:30`).toISOString());
      // Origin to destination fare: 70 km Pallevelugu = Rs 77
      expect(tt.trips.find((t) => t.serviceType === "PALLEVELUGU")?.farePaise).toBe(7700);
    });

    it("defaults to today and refuses a bad date", async () => {
      expect((await get(`/routes/${routeId("KNL-NDL-01")}/timetable`)).body.date).toBe(today);
      const bad = await get(`/routes/${routeId("KNL-NDL-01")}/timetable?date=2026-02-30`);
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe("VALIDATION_FAILED");
    });
  });

  describe("GET /search/trips", () => {
    const search = (from: string, to: string, date: string, extra = "") =>
      get(`/search/trips?from=${stopId(from)}&to=${stopId(to)}&date=${date}${extra}`);

    it("Kurnool to Vijayawada tomorrow returns Express, Ultra Deluxe and Super Luxury buses every hour (D-048)", async () => {
      const res = await search("KNL", "VJA", tomorrow);
      expect(res.status).toBe(200);
      const trips = SearchTripsResponse.parse(res.body);
      expect(trips).toHaveLength(18 * 13);
      const times = trips.map((t) => formatIstTime(new Date(t.departureAt)));
      expect(times[0]).toBe("05:00");
      expect(times.at(-1)).toBe("22:55");
      const at = (time: string) => trips.filter((t) => formatIstTime(new Date(t.departureAt)) === time);
      expect(at("05:00").map((t) => t.serviceType).sort()).toEqual(["AMARAVATI_AC", "EXPRESS"]);
      for (const hour of ["05", "12", "22"]) {
        const inHour = trips.filter((t) => formatIstTime(new Date(t.departureAt)).startsWith(`${hour}:`));
        for (const type of ["EXPRESS", "ULTRA_DELUXE", "SUPER_LUXURY"]) {
          expect(inHour.filter((t) => t.serviceType === type), `${hour} ${type}`).toHaveLength(4);
        }
      }
      // Express 365 km is Rs 541 (docs/19). Super Luxury 657 + 30, Ultra Deluxe 584 + 30, Amaravati 912.50 rounds to 913 + 30.
      const fareOf = (type: string) => trips.find((t) => t.serviceType === type)?.farePaise;
      expect([fareOf("EXPRESS"), fareOf("SUPER_LUXURY"), fareOf("ULTRA_DELUXE"), fareOf("AMARAVATI_AC")]).toEqual([54100, 68700, 61400, 94300]);
      const express = at("05:00").find((t) => t.serviceType === "EXPRESS")!;
      expect(formatIstTime(new Date(express.arrivalAt))).toBe("10:40");
      expect(express).toMatchObject({
        routeCode: "KNL-VJA-01",
        durationMin: 340,
        seatsLeft: 44,
        displayStatus: "UPCOMING",
        delayMinutes: 0,
        freeTravelEligible: true,
      });
      expect(trips.find((t) => t.serviceType === "AMARAVATI_AC")?.freeTravelEligible).toBe(false);
    });

    it("uses the boarding stop times and the km between the two stops", async () => {
      const trips = SearchTripsResponse.parse((await search("NDL", "GNT", tomorrow)).body);
      expect(trips).toHaveLength(18 * 13);
      // Leaves Kurnool 05:00, reaches Nandyal after 75 min and Guntur after 320 min. 260 km Express = 364 + 30.
      const express = trips.find((t) => t.serviceType === "EXPRESS")!;
      expect(formatIstTime(new Date(express.departureAt))).toBe("06:15");
      expect(formatIstTime(new Date(express.arrivalAt))).toBe("10:20");
      expect(express.durationMin).toBe(245);
      expect(express.farePaise).toBe(39400);
    });

    it("filters by departure time with after", async () => {
      const trips = SearchTripsResponse.parse(
        (await search("KNL", "VJA", tomorrow, "&after=10:00")).body,
      );
      const times = trips.map((t) => formatIstTime(new Date(t.departureAt)));
      expect(times).toHaveLength(169);
      expect(times[0]).toBe("10:00");
      expect(times.every((t) => t >= "10:00")).toBe(true);
    });

    it("counts taken seats and never goes below zero", async () => {
      const first = SearchTripsResponse.parse((await search("KNL", "VJA", tomorrow)).body);
      repo.taken.set(first[0]!.tripId, 40);
      repo.taken.set(first[1]!.tripId, 99);
      const again = SearchTripsResponse.parse((await search("KNL", "VJA", tomorrow)).body);
      const left = (id: string) => again.find((t) => t.tripId === id)?.seatsLeft;
      expect(left(first[0]!.tripId)).toBe(Math.max(0, first[0]!.seatsLeft - 40));
      expect(left(first[1]!.tripId)).toBe(0);
      repo.taken.clear();
    });

    it("leaves out cancelled trips", async () => {
      const first = SearchTripsResponse.parse((await search("KNL", "VJA", tomorrow)).body);
      const trip = repo.trips.find((t) => t.id === first[2]!.tripId)!;
      trip.status = "CANCELLED";
      const again = SearchTripsResponse.parse((await search("KNL", "VJA", tomorrow)).body);
      expect(again).toHaveLength(18 * 13 - 1);
      expect(again.some((t) => t.tripId === trip.id)).toBe(false);
      trip.status = "SCHEDULED";
    });

    it("returns the reverse route trips from Vijayawada to Kurnool", async () => {
      const trips = SearchTripsResponse.parse((await search("VJA", "KNL", tomorrow)).body);
      const times = trips.map((t) => formatIstTime(new Date(t.departureAt)));
      expect(times).toHaveLength(18 * 13);
      expect(times[0]).toBe("05:30");
      expect(times.at(-1)).toBe("23:25");
    });

    it("returns nothing for stops that are not on one route", async () => {
      const res = await search("ORV", "SMC", tomorrow);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it.each([
      ["an invalid date", `from=${stopId("KNL")}&to=${stopId("VJA")}&date=2026-02-30`],
      ["a date in another format", `from=${stopId("KNL")}&to=${stopId("VJA")}&date=01-10-2026`],
      ["a missing from", `to=${stopId("VJA")}&date=${tomorrow}`],
      ["the same stop twice", `from=${stopId("KNL")}&to=${stopId("KNL")}&date=${tomorrow}`],
      [
        "a bad after time",
        `from=${stopId("KNL")}&to=${stopId("VJA")}&date=${tomorrow}&after=25:00`,
      ],
    ])("answers VALIDATION_FAILED for %s", async (_label, qs) => {
      const res = await get(`/search/trips?${qs}`);
      expect(res.status).toBe(400);
      expect(ErrorResponse.parse(res.body).error.code).toBe("VALIDATION_FAILED");
    });

    it("is public and limited to 60 per minute", async () => {
      const res = await search("KNL", "VJA", tomorrow);
      expect(res.status).toBe(200);
      expect(res.headers["x-ratelimit-limit"]).toBe("60");
    });
  });
});

describe("Search on a one way network", () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const repo = new FakeNetworkRepository({ dates: [tomorrow], routeCodes: ["KNL-VJA-01"] });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: async () => [1], onModuleDestroy: async () => undefined })
      .overrideProvider(RedisService)
      // Not ready: the throttler fails open, which is fine for this test
      .useValue({
        client: { status: "end", ping: async () => "PONG" },
        onModuleDestroy: async () => undefined,
      })
      .overrideProvider(NetworkRepository)
      .useValue(repo)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureHttpApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("returns nothing in the reverse direction of a one way stop pair", async () => {
    const forward = await request(app.getHttpServer()).get(
      `/api/v1/search/trips?from=${stopId("KNL")}&to=${stopId("VJA")}&date=${tomorrow}`,
    );
    expect(forward.body).toHaveLength(18 * 13);
    const reverse = await request(app.getHttpServer()).get(
      `/api/v1/search/trips?from=${stopId("VJA")}&to=${stopId("KNL")}&date=${tomorrow}`,
    );
    expect(reverse.status).toBe(200);
    expect(reverse.body).toEqual([]);
  });
});
