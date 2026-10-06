/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { NotificationsService } from "../notifications/notifications.service";
import { TripNotificationsService } from "./trip-notifications.service";
import type { TripContext } from "./trip-context.service";
import { createMemoryPrisma } from "../../../test/memory-prisma";
const departure = new Date("2026-10-05T04:30:00Z");
const context = {
  trip: {
    id: "tripnotify00001",
    scheduledDepartureAt: departure,
    scheduledArrivalAt: new Date(+departure + 60 * 60_000),
    actualDepartureAt: departure,
  },
  route: { nameEn: "Route", nameTe: "??????" },
  stops: [
    { stopId: "origin", seq: 1, minutesFromOrigin: 0, nameEn: "Origin", nameTe: "????? ??????" },
    { stopId: "next", seq: 2, minutesFromOrigin: 10, nameEn: "Next", nameTe: "?????? ??????" },
  ],
} as TripContext;
describe("Trip notifications", () => {
  it("deduplicates departure and delay bands across repeated pings and a new service instance", async () => {
    const tables = {
      ticket: [
        {
          id: "ticketnotify001",
          tripId: context.trip.id,
          holderUserId: "citizen001",
          boardingStopId: "next",
          status: "BOOKED",
        },
        {
          id: "excluded001",
          tripId: context.trip.id,
          holderUserId: "excluded",
          boardingStopId: "next",
          status: "USED",
        },
      ],
      notification: [],
      user: [],
    };
    const prisma = createMemoryPrisma(tables) as any;
    const notifications = new NotificationsService(prisma);
    const first = new TripNotificationsService(prisma, notifications);
    await first.update(context, 0, 1, departure, true);
    await first.update(context, 0, 1, departure, true);
    await first.update(context, 9, 1, departure);
    await first.update(context, 10, 1, departure);
    await first.update(context, 24, 1, departure);
    await first.update(context, 25, 1, departure);
    const restarted = new TripNotificationsService(prisma, new NotificationsService(prisma));
    await restarted.update(context, 25, 1, departure);
    await restarted.update(context, 40, 1, departure);
    const rows = tables.notification as any[];
    expect(rows.filter((n) => n.type === "TRIP_DEPARTED")).toHaveLength(1);
    expect(rows.filter((n) => n.type === "TRIP_DELAYED").map((n) => n.params.minutes)).toEqual([
      10, 25, 40,
    ]);
    expect(rows.filter((n) => n.type === "BUS_NEAR_STOP")).toHaveLength(1);
    expect(rows.every((n) => n.userId === "citizen001")).toBe(true);
  });
  it("waits until boarding ETA is 10 minutes or less and sends once per ticket", async () => {
    const c = {
      ...context,
      stops: [context.stops[0]!, { ...context.stops[1]!, minutesFromOrigin: 11 }],
    };
    const tables = {
      ticket: [
        {
          id: "near001",
          tripId: c.trip.id,
          holderUserId: "citizen001",
          boardingStopId: "next",
          status: "ACTIVE",
        },
      ],
      notification: [],
      user: [],
    };
    const prisma = createMemoryPrisma(tables) as any;
    const service = new TripNotificationsService(prisma, new NotificationsService(prisma));
    await service.update(c, 0, 1, departure);
    expect(tables.notification).toHaveLength(0);
    await service.update(c, 0, 2, new Date(+departure + 11 * 60_000));
    await service.update(c, 0, 2, new Date(+departure + 12 * 60_000));
    expect(tables.notification).toHaveLength(1);
  });
});
