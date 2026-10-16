import { describe, expect, it } from "vitest";
import { SAVED_ROUTES_MAX } from "@aptransit/shared";
import type { PrismaService } from "../../prisma/prisma.service";
import { MeService } from "./me.service";

// D-048 Phase 3: saved routes belong to one citizen, are unique per pair and capped.

interface Row {
  id: string;
  userId: string;
  fromStopId: string;
  toStopId: string;
  createdAt: Date;
}

function build(stopIds = ["s1", "s2", "s3"]) {
  const rows: Row[] = [];
  const stop = (id: string) => ({ id, nameEn: id.toUpperCase(), nameTe: `te-${id}` });
  const withStops = (r: Row) => ({ ...r, fromStop: stop(r.fromStopId), toStop: stop(r.toStopId) });
  const prisma = {
    stop: { count: async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.filter((id, i, a) => stopIds.includes(id) && a.indexOf(id) === i).length },
    savedRoute: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        rows.filter((r) => r.userId === where.userId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map(withStops),
      findUnique: async ({ where }: { where: { userId_fromStopId_toStopId: Omit<Row, "id" | "createdAt"> } }) => {
        const k = where.userId_fromStopId_toStopId;
        const r = rows.find((x) => x.userId === k.userId && x.fromStopId === k.fromStopId && x.toStopId === k.toStopId);
        return r ? withStops(r) : null;
      },
      count: async ({ where }: { where: { userId: string } }) => rows.filter((r) => r.userId === where.userId).length,
      create: async ({ data }: { data: Omit<Row, "id" | "createdAt"> }) => {
        const r: Row = { id: `r${rows.length + 1}`, createdAt: new Date(rows.length * 1000), ...data };
        rows.push(r);
        return withStops(r);
      },
      deleteMany: async ({ where }: { where: { id: string; userId: string } }) => {
        const i = rows.findIndex((r) => r.id === where.id && r.userId === where.userId);
        if (i >= 0) rows.splice(i, 1);
        return { count: i >= 0 ? 1 : 0 };
      },
    },
  } as unknown as PrismaService;
  return { service: new MeService(prisma), rows };
}

describe("MeService saved routes", () => {
  it("saves a pair and lists it newest first with stop names in both languages", async () => {
    const { service } = build();
    await service.saveRoute("u1", { fromStopId: "s1", toStopId: "s2" });
    await service.saveRoute("u1", { fromStopId: "s2", toStopId: "s3" });
    const list = await service.savedRoutes("u1");
    expect(list.map((r) => r.from.id)).toEqual(["s2", "s1"]);
    expect(list[1]).toMatchObject({ from: { nameEn: "S1", nameTe: "te-s1" }, to: { id: "s2" } });
  });

  it("saving the same pair twice keeps one row", async () => {
    const { service, rows } = build();
    const a = await service.saveRoute("u1", { fromStopId: "s1", toStopId: "s2" });
    const b = await service.saveRoute("u1", { fromStopId: "s1", toStopId: "s2" });
    expect(b.id).toBe(a.id);
    expect(rows).toHaveLength(1);
  });

  it("the reverse direction is a different route", async () => {
    const { service, rows } = build();
    await service.saveRoute("u1", { fromStopId: "s1", toStopId: "s2" });
    await service.saveRoute("u1", { fromStopId: "s2", toStopId: "s1" });
    expect(rows).toHaveLength(2);
  });

  it("refuses an unknown stop", async () => {
    const { service } = build();
    await expect(service.saveRoute("u1", { fromStopId: "s1", toStopId: "nope" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("caps the list and still returns an existing pair at the cap", async () => {
    const ids = Array.from({ length: SAVED_ROUTES_MAX + 2 }, (_, i) => `s${i}`);
    const { service } = build(ids);
    for (let i = 0; i < SAVED_ROUTES_MAX; i++) await service.saveRoute("u1", { fromStopId: ids[i]!, toStopId: ids[i + 1]! });
    await expect(service.saveRoute("u1", { fromStopId: ids[0]!, toStopId: ids[11]! })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(service.saveRoute("u1", { fromStopId: ids[0]!, toStopId: ids[1]! })).resolves.toMatchObject({ from: { id: "s0" } });
  });

  it("one citizen never sees or deletes another's routes", async () => {
    const { service, rows } = build();
    const mine = await service.saveRoute("u1", { fromStopId: "s1", toStopId: "s2" });
    expect(await service.savedRoutes("u2")).toEqual([]);
    await expect(service.deleteRoute("u2", mine.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(rows).toHaveLength(1);
    await service.deleteRoute("u1", mine.id);
    expect(rows).toHaveLength(0);
  });
});
