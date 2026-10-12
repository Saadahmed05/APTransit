import {
  formatIstDate,
  formatIstTime,
  SearchTripsResponse,
  TimetableDto,
  VILLAGE_SERVICE_TYPES,
} from "@aptransit/shared";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureHttpApp } from "../src/http-app";
import { PrismaService } from "../src/prisma/prisma.service";
import { RedisService } from "../src/redis/redis.service";

// The real search SQL against the Neon test branch (docs/14). Runs only when TEST_DATABASE_URL is set,
// and expects the branch to be seeded (`pnpm db:seed`, which seed.test.ts also runs).

const databaseUrl = process.env.TEST_DATABASE_URL;
const tomorrow = formatIstDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
const villageServices = new Set<string>(VILLAGE_SERVICE_TYPES);
const higherServices = new Set([
  "EXPRESS",
  "ULTRA_DELUXE",
  "SUPER_LUXURY",
  "INDRA_AC",
  "AMARAVATI_AC",
  "GARUDA_AC",
]);

describe.skipIf(!databaseUrl)("Network and search against the Neon test branch", () => {
  let app: NestExpressApplication;
  const ids = new Map<string, string>();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RedisService)
      .useValue({
        client: { status: "end", ping: async () => "PONG" },
        onModuleDestroy: () => undefined,
      })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureHttpApp(app);
    await app.init();

    const prisma = app.get(PrismaService);
    for (const stop of await prisma.stop.findMany({ select: { id: true, code: true } }))
      ids.set(stop.code, stop.id);
    for (const route of await prisma.route.findMany({ select: { id: true, code: true } }))
      ids.set(route.code, route.id);
  });

  afterAll(async () => {
    await app?.close();
  });

  it("Kurnool to Vijayawada tomorrow returns 6 trips with docs/19 times and fares", async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/v1/search/trips?from=${ids.get("KNL")}&to=${ids.get("VJA")}&date=${tomorrow}`,
    );
    expect(res.status).toBe(200);
    const trips = SearchTripsResponse.parse(res.body);
    expect(trips.map((t) => formatIstTime(new Date(t.departureAt)))).toEqual([
      "05:30",
      "06:30",
      "08:00",
      "10:00",
      "13:00",
      "21:30",
    ]);
    expect(trips.map((t) => t.farePaise)).toEqual([54100, 54100, 68700, 54100, 61400, 94300]);
  });

  it("limits Kurnool to Orvakal to village services", async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/v1/search/trips?from=${ids.get("KNL")}&to=${ids.get("ORV")}&date=${tomorrow}`,
    );
    expect(res.status).toBe(200);
    const trips = SearchTripsResponse.parse(res.body);
    expect(trips.length).toBeGreaterThan(0);
    expect(trips.every((trip) => villageServices.has(trip.serviceType))).toBe(true);
  });

  it("keeps higher service types for bus stand journeys", async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/v1/search/trips?from=${ids.get("KNL")}&to=${ids.get("VJA")}&date=${tomorrow}`,
    );
    expect(res.status).toBe(200);
    const trips = SearchTripsResponse.parse(res.body);
    expect(trips.some((trip) => higherServices.has(trip.serviceType))).toBe(true);
  });

  it("returns the 21:00 Vijayawada trip with a next date arrival", async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/v1/search/trips?from=${ids.get("VJA")}&to=${ids.get("DWK")}&date=${tomorrow}`,
    );
    expect(res.status).toBe(200);
    const trips = SearchTripsResponse.parse(res.body);
    const overnight = trips.find((trip) => formatIstTime(new Date(trip.departureAt)) === "21:00");
    expect(overnight).toBeDefined();
    expect(formatIstDate(new Date(overnight!.arrivalAt))).not.toBe(
      formatIstDate(new Date(overnight!.departureAt)),
    );
  });

  it("finds Kurnool from Telugu input", async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/v1/places/search?q=${encodeURIComponent("కర్నూ")}`,
    );
    expect(res.status).toBe(200);
    expect(res.body[0].id).toBe(ids.get("KNL"));
  });

  it("gives the Kurnool to Nandyal timetable", async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/v1/routes/${ids.get("KNL-NDL-01")}/timetable?date=${tomorrow}`,
    );
    const tt = TimetableDto.parse(res.body);
    expect(tt.firstDepartureLocal).toBe("05:00");
    expect(tt.frequencyMin).toBe(30);
  });

  it("answers search under 250 ms at p95 on a warm connection", async () => {
    const path = `/api/v1/search/trips?from=${ids.get("KNL")}&to=${ids.get("VJA")}&date=${tomorrow}`;
    const timings: number[] = [];
    for (let i = 0; i < 20; i++) {
      const started = performance.now();
      await request(app.getHttpServer()).get(path);
      timings.push(performance.now() - started);
    }
    timings.sort((a, b) => a - b);
    expect(timings[Math.ceil(timings.length * 0.95) - 1]).toBeLessThan(250);
  });
});
