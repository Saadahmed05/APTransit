import { describe, expect, it } from "vitest";
import { isLocalBusService, LOCAL_BUS_SERVICE_TYPES, ServiceType } from "./enums.js";

describe("local bus service types", () => {
  it("blocks only city ordinary and metro express seat booking", () => {
    expect(LOCAL_BUS_SERVICE_TYPES).toEqual(["CITY_ORDINARY", "METRO_EXPRESS"]);

    for (const serviceType of ServiceType.options) {
      expect(isLocalBusService(serviceType)).toBe(
        serviceType === "CITY_ORDINARY" || serviceType === "METRO_EXPRESS",
      );
    }
  });
});
