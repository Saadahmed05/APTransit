import { describe, expect, it } from "vitest";
import { PLATFORM_TIME_ZONE } from "../time";
import { GrantRoleInput } from "./admin";
import { GovStateQuery } from "./gov";
import { StateDto } from "./network";
import { SubscribeInput } from "./tracking";

// D-034: State above District, state scoped roles, state:{id} socket rooms, one platform zone.
const STATE = "stateap000000000000000000";

describe("state model contracts (D-034)", () => {
  it("has one platform time zone", () => {
    expect(PLATFORM_TIME_ZONE).toBe("Asia/Kolkata");
    // IST is UTC+05:30: midnight UTC is 05:30 on the platform clock
    const clock = new Intl.DateTimeFormat("en-GB", { timeZone: PLATFORM_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    expect(clock.format(new Date("2026-10-09T00:00:00Z"))).toBe("05:30");
  });

  it("requires a state for STATE_ADMIN and TRANSPORT_OFFICER, and no scope for SUPER_ADMIN", () => {
    expect(GrantRoleInput.safeParse({ role: "STATE_ADMIN", stateId: STATE }).success).toBe(true);
    expect(GrantRoleInput.safeParse({ role: "TRANSPORT_OFFICER", stateId: STATE }).success).toBe(true);
    expect(GrantRoleInput.safeParse({ role: "STATE_ADMIN" }).success).toBe(false);
    expect(GrantRoleInput.safeParse({ role: "SUPER_ADMIN" }).success).toBe(true);
    expect(GrantRoleInput.safeParse({ role: "SUPER_ADMIN", stateId: STATE }).success).toBe(false);
    expect(GrantRoleInput.safeParse({ role: "DISTRICT_OFFICER", districtId: "districtknl0001", stateId: STATE }).success).toBe(false);
    expect(GrantRoleInput.safeParse({ role: "DEPOT_STAFF", depotId: "depotknl0000001" }).success).toBe(true);
  });

  it("accepts state:{id} rooms and refuses the old bare state room", () => {
    expect(SubscribeInput.safeParse({ room: `state:${STATE}` }).success).toBe(true);
    expect(SubscribeInput.safeParse({ room: "state" }).success).toBe(false);
    expect(SubscribeInput.safeParse({ room: "state:AP" }).success).toBe(false);
  });

  it("describes a state with its map view and takes an optional state on gov reads", () => {
    const ap = { id: STATE, code: "AP", nameEn: "Andhra Pradesh", nameTe: "ఆంధ్రప్రదేశ్", center: { lat: 16, lng: 78 }, bounds: [76.7, 12.6, 84.8, 19.95], zoom: 7 };
    expect(StateDto.parse(ap)).toEqual(ap);
    expect(GovStateQuery.parse({ stateId: STATE, date: "2026-10-09" })).toEqual({ stateId: STATE, date: "2026-10-09" });
    expect(GovStateQuery.parse({})).toEqual({});
    expect(GovStateQuery.safeParse({ stateId: "x" }).success).toBe(false);
  });
});
