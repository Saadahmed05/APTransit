import { describe, expect, it } from "vitest";
import type { PrismaService } from "../../prisma/prisma.service";
import type { RedisService } from "../../redis/redis.service";
import { ConductorService } from "./conductor.service";

const NOW = new Date("2026-10-17T09:30:00.000Z");
const at = (minutesFromNow: number) => new Date(NOW.getTime() + minutesFromNow * 60_000);

function assignment(id: string, departure: Date, status = "SCHEDULED") {
  return { tripId: id, trip: { id, status, scheduledDepartureAt: departure, route: {} } };
}

function service(rows: ReturnType<typeof assignment>[]) {
  const prisma = { tripAssignment: { findMany: async () => rows } } as unknown as PrismaService;
  return new ConductorService(prisma, {} as RedisService);
}

describe("ConductorService.assignment", () => {
  it("skips trips that are more than 60 min late to start, like the driver app", async () => {
    const rows = [assignment("tripearly0001", at(-300)), assignment("tripnext00001", at(-20)), assignment("triplater0001", at(40))];
    expect((await service(rows).assignment("user", undefined, NOW))?.tripId).toBe("tripnext00001");
  });

  it("prefers the running trip", async () => {
    const rows = [assignment("tripnext00001", at(10)), assignment("triprunning01", at(-200), "RUNNING")];
    expect((await service(rows).assignment("user", undefined, NOW))?.tripId).toBe("triprunning01");
  });

  it("has no trip when every trip of the day is past its start window", async () => {
    expect(await service([assignment("tripearly0001", at(-300))]).assignment("user", undefined, NOW)).toBeNull();
  });

  it("still finds an asked trip, so the manifest of an earlier trip opens", async () => {
    const rows = [assignment("tripearly0001", at(-300))];
    expect((await service(rows).assignment("user", "tripearly0001", NOW))?.tripId).toBe("tripearly0001");
  });
});
