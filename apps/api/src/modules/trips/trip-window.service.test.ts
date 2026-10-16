import { describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env";
import type { PrismaService } from "../../prisma/prisma.service";
import type { RedisService } from "../../redis/redis.service";
import type { TripGeneratorService } from "./trip-generator.service";
import { TripWindowService } from "./trip-window.service";

const NOW = new Date("2026-10-16T03:00:00.000Z"); // 08:30 IST

function setup(options: { env?: Partial<Record<string, unknown>>; tripCount?: number; lockFree?: boolean } = {}) {
  const env: Record<string, unknown> = { NODE_ENV: "production", WORKER: false, ...options.env };
  const config = { get: (key: string) => env[key] } as unknown as ConfigService<Env, true>;
  const locks = new Set<string>();
  const redis = {
    client: {
      set: vi.fn(async (key: string, _v: string, _ex: string, _s: number, nx: string) => {
        if (nx === "NX" && (locks.has(key) || options.lockFree === false)) return null;
        locks.add(key);
        return "OK";
      }),
      del: vi.fn(async (key: string) => locks.delete(key)),
    },
  } as unknown as RedisService;
  const prisma = { trip: { count: vi.fn(async () => options.tripCount ?? 0) } } as unknown as PrismaService;
  const generator = {
    windowDays: vi.fn(async () => 30),
    generateRange: vi.fn(async () => 5),
    pruneInactiveFuture: vi.fn(async () => 0),
    applyAutoAssign: vi.fn(async () => 0),
  } as unknown as TripGeneratorService & Record<string, ReturnType<typeof vi.fn>>;
  return { service: new TripWindowService(prisma, redis, generator, config), generator, prisma, redis };
}

describe("TripWindowService (D-048)", () => {
  it("fills every day from today to today plus the booking window, then prunes and assigns", async () => {
    const { service, generator } = setup();
    const created = await service.ensureWindow(NOW);
    expect(generator.generateRange).toHaveBeenCalledTimes(31);
    expect(generator.generateRange).toHaveBeenNthCalledWith(1, "2026-10-16", "2026-10-16");
    expect(generator.generateRange).toHaveBeenLastCalledWith("2026-11-15", "2026-11-15");
    expect(generator.pruneInactiveFuture).toHaveBeenCalledWith("2026-10-16");
    expect(generator.applyAutoAssign).toHaveBeenCalledWith("2026-10-16", "2026-11-15");
    expect(created).toBe(155);
  });

  it("does nothing while another fill holds the lock", async () => {
    const { service, generator } = setup({ lockFree: false });
    expect(await service.ensureWindow(NOW)).toBe(0);
    expect(generator.generateRange).not.toHaveBeenCalled();
  });

  it("generates a searched date that has no trips, once per memo period", async () => {
    const { service, generator, prisma } = setup({ tripCount: 0 });
    await service.ensureDate("2026-10-20", NOW);
    await service.ensureDate("2026-10-20", NOW);
    expect(generator.generateRange).toHaveBeenCalledTimes(1);
    expect(generator.generateRange).toHaveBeenCalledWith("2026-10-20", "2026-10-20");
    expect(prisma.trip.count).toHaveBeenCalledTimes(1);
  });

  it("leaves dates that already have trips, and dates outside the window, alone", async () => {
    const { service, generator } = setup({ tripCount: 12 });
    await service.ensureDate("2026-10-20", NOW);
    await service.ensureDate("2026-10-15", NOW);
    await service.ensureDate("2026-12-31", NOW);
    expect(generator.generateRange).not.toHaveBeenCalled();
  });

  it("is off in tests and never throws into a search", async () => {
    const off = setup({ env: { NODE_ENV: "test" } });
    await off.service.ensureDate("2026-10-20", NOW);
    expect(off.generator.generateRange).not.toHaveBeenCalled();

    const failing = setup();
    (failing.prisma.trip.count as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("db down"));
    await expect(failing.service.ensureDate("2026-10-20", NOW)).resolves.toBeUndefined();
  });

  it("does not start timers inside the worker process", () => {
    vi.useFakeTimers();
    try {
      const { service, generator } = setup({ env: { WORKER: true } });
      service.onApplicationBootstrap();
      vi.advanceTimersByTime(60_000);
      expect(generator.generateRange).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
