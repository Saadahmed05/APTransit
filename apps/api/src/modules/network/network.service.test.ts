import { formatIstDate, formatIstTime, localTimeToUtc } from "@aptransit/shared";
import { describe, expect, it } from "vitest";
import { FakeNetworkRepository, routeId, stopId } from "../../../test/network-fixture";
import type { NetworkRepository, StopSearchRow } from "./network.repository";
import { NetworkService, rankPlaces, villageFit } from "./network.service";
import { medianGapMinutes } from "./trip-summary";

const DATE = "2026-10-01";
const at = (hhmm: string) => localTimeToUtc(DATE, hhmm);

function makeService(repo = new FakeNetworkRepository({ dates: [DATE] })) {
  return { repo, service: new NetworkService(repo as unknown as NetworkRepository) };
}

describe("NetworkService.searchTrips", () => {
  const query = { from: stopId("KNL"), to: stopId("VJA"), date: DATE };
  const times = (trips: { departureAt: string }[]) =>
    trips.map((t) => formatIstTime(new Date(t.departureAt)));

  it("closes booking 10 minutes before departure from the boarding stop", async () => {
    const { service } = makeService();
    expect(times(await service.searchTrips(query, at("04:49")))).toContain("05:00");
    // 04:50 is exactly the close time: closed
    expect(times(await service.searchTrips(query, at("04:50")))).not.toContain("05:00");
    expect(times(await service.searchTrips(query, at("04:50")))[0]).toBe("05:05");
  });

  it("uses the boarding stop departure for the close check", async () => {
    const { service } = makeService();
    // The 05:00 bus leaves Nandyal at 06:15, so it is still bookable from Nandyal at 06:00
    const trips = await service.searchTrips(
      { from: stopId("NDL"), to: stopId("VJA"), date: DATE },
      at("06:00"),
    );
    expect(times(trips)[0]).toBe("06:15");
  });

  it("reads the close time from settings", async () => {
    const { repo, service } = makeService();
    repo.settings.set("booking.closeMinutesBefore", 60);
    expect(times(await service.searchTrips(query, at("04:15")))[0]).toBe("05:20");
  });

  it("falls back to 10 minutes when the setting is missing", async () => {
    const { repo, service } = makeService();
    repo.settings.clear();
    expect(times(await service.searchTrips(query, at("04:49")))[0]).toBe("05:00");
  });

  it("returns nothing for a past date", async () => {
    const { service } = makeService();
    expect(await service.searchTrips(query, new Date(`2026-10-03T00:00:00Z`))).toEqual([]);
  });

  it("makes one trip query and one seat query", async () => {
    const { repo, service } = makeService();
    await service.searchTrips(query, at("00:00"));
    expect(repo.calls.tripRows).toBe(1);
    expect(repo.calls.seatsTaken).toBe(1);
  });

  it("skips trips without a fare rule", async () => {
    const { repo, service } = makeService();
    const original = repo.tripRows.bind(repo);
    repo.tripRows = async (args) =>
      (await original(args)).map((r, i) => (i === 0 ? { ...r, fare: null } : r));
    expect(await service.searchTrips(query, at("00:00"))).toHaveLength(18 * 13 - 1);
  });

  it("shows a delayed trip as DELAYED with its delay", async () => {
    const { repo, service } = makeService();
    const trips = await service.searchTrips(query, at("00:00"));
    repo.trips.find((t) => t.id === trips[1]!.tripId)!.delayMinutes = 12;
    const again = await service.searchTrips(query, at("00:00"));
    expect(again[1]).toMatchObject({ displayStatus: "DELAYED", delayMinutes: 12 });
  });
});

describe("NetworkService.timetable", () => {
  it("gives the next departure after now on that date", async () => {
    const { service } = makeService();
    const tt = await service.timetable(routeId("KNL-NDL-01"), DATE, at("12:10"));
    expect(tt.nextDepartureAt).toBe(at("12:15").toISOString());
    expect(tt.frequencyMin).toBe(5);
  });

  it("has no next departure after the last bus", async () => {
    const { service } = makeService();
    expect(
      (await service.timetable(routeId("KNL-NDL-01"), DATE, at("23:01"))).nextDepartureAt,
    ).toBeNull();
  });

  it("keeps cancelled trips in the list but not in first, last or next", async () => {
    const { repo, service } = makeService();
    const route = routeId("KNL-VJA-01");
    const firstHour = repo.trips.filter(
      (t) => t.routeId === route && formatIstTime(new Date(t.departureMs)) === "05:00",
    );
    expect(firstHour).toHaveLength(2);
    for (const trip of firstHour) trip.status = "CANCELLED";
    const tt = await service.timetable(route, DATE, at("04:00"));
    expect(tt.trips).toHaveLength(18 * 13);
    expect(tt.trips[0]?.displayStatus).toBe("CANCELLED");
    expect(tt.firstDepartureLocal).toBe("05:05");
    expect(tt.nextDepartureAt).toBe(at("05:05").toISOString());
  });

  it("is empty with nulls on a date without trips", async () => {
    const { service } = makeService();
    const tt = await service.timetable(routeId("KNL-VJA-01"), "2026-10-05", at("04:00"));
    expect(tt).toEqual({
      date: "2026-10-05",
      firstDepartureLocal: null,
      lastDepartureLocal: null,
      nextDepartureAt: null,
      frequencyMin: null,
      trips: [],
    });
  });

  it("defaults the date to today in IST", async () => {
    const { service } = makeService();
    // 20:00 UTC on 30 Sep is 01:30 IST on 1 Oct
    const now = new Date("2026-09-30T20:00:00Z");
    expect((await service.timetable(routeId("KNL-VJA-01"), undefined, now)).date).toBe(
      formatIstDate(now),
    );
    expect(formatIstDate(now)).toBe(DATE);
  });
});

describe("rankPlaces", () => {
  const row = (nameEn: string, isBusStand: boolean, nameTe = ""): StopSearchRow => ({
    id: nameEn,
    nameEn,
    nameTe,
    isBusStand,
    districtNameEn: "",
    districtNameTe: "",
  });

  it("puts bus stands first, then prefix matches, then by name", () => {
    const ranked = rankPlaces(
      [
        row("Mydukur", false),
        row("Urvakonda", false),
        row("Guntur Bus Stand", true),
        row("Anantapur Bus Stand", true),
      ],
      "ur",
    );
    expect(ranked.map((r) => r.nameEn)).toEqual([
      "Anantapur Bus Stand",
      "Guntur Bus Stand",
      "Urvakonda",
      "Mydukur",
    ]);
  });

  it("treats a Telugu prefix as a prefix match", () => {
    const ranked = rankPlaces([row("B", false, "అకర్నూ"), row("A", false, "కర్నూలు")], "కర్నూ");
    expect(ranked[0]?.nameEn).toBe("A");
  });
});

describe("medianGapMinutes", () => {
  const m = (...mins: number[]) => mins.map((x) => x * 60_000);
  it("returns the median gap", () => {
    expect(medianGapMinutes(m(0, 30, 60, 90))).toBe(30);
    expect(medianGapMinutes(m(0, 10, 40, 100))).toBe(30);
    expect(medianGapMinutes(m(0, 60, 90, 210, 240))).toBe(45);
  });
  it("is null with fewer than two departures", () => {
    expect(medianGapMinutes([])).toBeNull();
    expect(medianGapMinutes(m(5))).toBeNull();
  });
});

describe("villageFit (D-042)", () => {
  const row = (serviceType: string, villageEnd: boolean) => ({ serviceType, villageEnd }) as never;
  it("keeps only village buses for a village journey when there are any", () => {
    const rows = [row("EXPRESS", true), row("PALLEVELUGU", true)];
    expect(villageFit(rows)).toEqual([row("PALLEVELUGU", true)]);
  });
  it("falls back to every bus when no village bus serves the pair, and leaves bus stand pairs alone", () => {
    expect(villageFit([row("EXPRESS", true)])).toHaveLength(1);
    expect(villageFit([row("EXPRESS", false), row("PALLEVELUGU", false)])).toHaveLength(2);
  });
});
