import { describe, expect, it } from "vitest";
import { alightingPlan, nextStopSeqOf } from "./alighting";

const stops = [
  { stopId: "knl", seq: 1, nameEn: "Kurnool", nameTe: "కర్నూలు" },
  { stopId: "ndl", seq: 2, nameEn: "Nandyal", nameTe: "నంద్యాల" },
  { stopId: "gdl", seq: 3, nameEn: "Giddalur", nameTe: "గిద్దలూరు" },
  { stopId: "vja", seq: 4, nameEn: "Vijayawada", nameTe: "విజయవాడ" },
];

describe("alightingPlan (D-044)", () => {
  it("counts passengers per dropping stop, nearest first, and flags the next stop", () => {
    const plan = alightingPlan(stops, ["vja", "ndl", "ndl", "gdl", "vja", "vja"], 2);
    expect(plan.nextStop).toEqual({ stopId: "ndl", seq: 2, nameEn: "Nandyal", nameTe: "నంద్యాల" });
    expect(plan.onBoard).toBe(6);
    expect(plan.stops.map((s) => [s.stopId, s.count, s.next])).toEqual([
      ["ndl", 2, true],
      ["gdl", 1, false],
      ["vja", 3, false],
    ]);
  });

  it("drops stops the bus has passed and stops that are not on the route", () => {
    const plan = alightingPlan(stops, ["ndl", "gdl", "elsewhere"], 3);
    expect(plan.stops.map((s) => s.stopId)).toEqual(["gdl"]);
    expect(plan.stops[0]!.next).toBe(true);
    expect(plan.onBoard).toBe(1);
  });

  it("counts every stop when the bus position is unknown", () => {
    const plan = alightingPlan(stops, ["ndl", "vja"], null);
    expect(plan.nextStop).toBeNull();
    expect(plan.stops.every((s) => !s.next)).toBe(true);
    expect(plan.onBoard).toBe(2);
  });

  it("is empty with nobody on board", () => {
    expect(alightingPlan(stops, [], 2)).toEqual({ nextStop: stops[1], onBoard: 0, stops: [] });
  });
});

describe("nextStopSeqOf", () => {
  it("prefers live GPS, then the last reached stop plus one", () => {
    expect(nextStopSeqOf(3, 1, 4)).toBe(3);
    expect(nextStopSeqOf(null, 1, 4)).toBe(2);
    expect(nextStopSeqOf(undefined, null, 4)).toBeNull();
  });

  it("has no next stop after the last stop", () => {
    expect(nextStopSeqOf(null, 4, 4)).toBeNull();
  });
});
