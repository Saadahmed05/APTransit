import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../prisma/prisma.service";
import type { RedisService } from "../../redis/redis.service";
import { HealthService, PROBE_TIMEOUT_MS, probe } from "./health.service";

function service(db: () => Promise<unknown>, redis: () => Promise<unknown>): HealthService {
  const prisma = { $queryRaw: () => db() } as unknown as PrismaService;
  const redisService = { client: { ping: () => redis() } } as unknown as RedisService;
  return new HealthService(prisma, redisService);
}

describe("probe", () => {
  it("reports ok when the check resolves", async () => {
    await expect(probe(async () => 1)).resolves.toBe("ok");
  });

  it("reports down when the check rejects", async () => {
    await expect(probe(async () => Promise.reject(new Error("boom")))).resolves.toBe("down");
  });

  it("reports down when the check is slower than the timeout", async () => {
    const slow = () => new Promise((resolve) => setTimeout(resolve, 200));
    await expect(probe(slow, 20)).resolves.toBe("down");
  });

  describe("default timeout", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("allows a slow but working database (Render to Neon, 1.5 s)", async () => {
      vi.useFakeTimers();
      expect(PROBE_TIMEOUT_MS).toBe(3_000);
      const result = probe(() => new Promise((resolve) => setTimeout(resolve, 1_500)));
      await vi.advanceTimersByTimeAsync(1_500);
      await expect(result).resolves.toBe("ok");
    });

    it("still reports down after 3 s", async () => {
      vi.useFakeTimers();
      const result = probe(() => new Promise((resolve) => setTimeout(resolve, 10_000)));
      await vi.advanceTimersByTimeAsync(3_000);
      await expect(result).resolves.toBe("down");
    });
  });
});

describe("HealthService", () => {
  it("is ok when db and redis answer", async () => {
    const report = await service(async () => [1], async () => "PONG").check();
    expect(report).toMatchObject({ status: "ok", db: "ok", redis: "ok" });
    expect(() => new Date(report.time).toISOString()).not.toThrow();
  });

  it("is degraded when one dependency is down", async () => {
    const report = await service(async () => [1], async () => Promise.reject(new Error("x"))).check();
    expect(report).toMatchObject({ status: "degraded", db: "ok", redis: "down" });
  });
});
