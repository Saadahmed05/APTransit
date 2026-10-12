import { describe, expect, it } from "vitest";
import {
  BUS_CLASSES,
  busClassOf,
  classCovers,
  coveredClasses,
  SERVICE_BUS_CLASS,
  servicesOfClass,
} from "./bus-class";
import { ServiceType } from "./enums";

describe("bus classes (D-044)", () => {
  it("puts every service in exactly one class", () => {
    for (const s of ServiceType.options) expect(BUS_CLASSES).toContain(SERVICE_BUS_CLASS[s]);
    const all = BUS_CLASSES.flatMap(servicesOfClass);
    expect(all.sort()).toEqual([...ServiceType.options].sort());
  });

  it("maps village and ordinary services to Normal", () => {
    expect(busClassOf("PALLEVELUGU")).toBe("NORMAL");
    expect(busClassOf("CITY_ORDINARY")).toBe("NORMAL");
    expect(busClassOf("EXPRESS")).toBe("EXPRESS");
    expect(busClassOf("SUPER_LUXURY")).toBe("SUPER_LUXURY");
    expect(busClassOf("GARUDA_AC")).toBe("SUPER_LUXURY");
  });

  it.each([
    ["NORMAL", "NORMAL", true],
    ["NORMAL", "EXPRESS", false],
    ["NORMAL", "SUPER_LUXURY", false],
    ["EXPRESS", "NORMAL", true],
    ["EXPRESS", "EXPRESS", true],
    ["EXPRESS", "SUPER_LUXURY", false],
    ["SUPER_LUXURY", "NORMAL", true],
    ["SUPER_LUXURY", "EXPRESS", true],
    ["SUPER_LUXURY", "SUPER_LUXURY", true],
  ] as const)("a %s ticket on a %s bus: %s", (ticket, bus, ok) => {
    expect(classCovers(ticket, bus)).toBe(ok);
  });

  it("lists covered classes highest first", () => {
    expect(coveredClasses("NORMAL")).toEqual(["NORMAL"]);
    expect(coveredClasses("EXPRESS")).toEqual(["EXPRESS", "NORMAL"]);
    expect(coveredClasses("SUPER_LUXURY")).toEqual(["SUPER_LUXURY", "EXPRESS", "NORMAL"]);
  });
});
