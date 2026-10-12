import type { ConductorAlightingDto } from "@aptransit/shared";

export interface AlightingStopRef {
  stopId: string;
  seq: number;
  nameEn: string;
  nameTe: string;
}

/**
 * D-044: who gets down where, ahead of the bus. Pure: the route stops, the dropping stop of every
 * ticket checked on this bus, and the next stop of the bus (null when unknown: every stop counts).
 * A dropping stop that is not on this route (a ticket accepted by the class rule always has both of
 * its stops on the route, so this only guards bad data) or that the bus has passed is not counted.
 */
export function alightingPlan(
  stops: AlightingStopRef[],
  droppingStopIds: string[],
  nextStopSeq: number | null,
): ConductorAlightingDto {
  const byId = new Map(stops.map((stop) => [stop.stopId, stop]));
  const counts = new Map<string, number>();
  for (const stopId of droppingStopIds) {
    const stop = byId.get(stopId);
    if (!stop || (nextStopSeq !== null && stop.seq < nextStopSeq)) continue;
    counts.set(stopId, (counts.get(stopId) ?? 0) + 1);
  }
  const next = nextStopSeq === null ? null : (stops.find((stop) => stop.seq === nextStopSeq) ?? null);
  const listed = stops
    .filter((stop) => counts.has(stop.stopId))
    .sort((a, b) => a.seq - b.seq)
    .map(({ stopId, seq, nameEn, nameTe }) => ({ stopId, seq, nameEn, nameTe, count: counts.get(stopId)!, next: seq === nextStopSeq }));
  return {
    nextStop: next ? { stopId: next.stopId, seq: next.seq, nameEn: next.nameEn, nameTe: next.nameTe } : null,
    onBoard: listed.reduce((sum, stop) => sum + stop.count, 0),
    stops: listed,
  };
}

/**
 * The next stop of the bus: live GPS first (docs/13), else one after the trip's last reached stop,
 * else unknown. Past the last stop there is no next stop.
 */
export function nextStopSeqOf(liveNextStopSeq: number | null | undefined, lastStopSeq: number | null, lastSeq: number): number | null {
  const seq = liveNextStopSeq ?? (lastStopSeq === null ? null : lastStopSeq + 1);
  return seq === null || seq > lastSeq ? null : seq;
}
