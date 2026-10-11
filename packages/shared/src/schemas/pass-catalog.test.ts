import { describe, expect, it } from "vitest";
import { AdminPassTypePatch } from "./admin";
import { CreatePassInput, StudentCheckInput } from "./passes";

// D-036: pass catalog contracts.
const id = (n: string) => `stop${n}0000000001`;

describe("pass catalog contracts (D-036)", () => {
  it("takes both stops or neither, and never the same stop twice", () => {
    expect(CreatePassInput.safeParse({ passTypeId: "passtypeday00001" }).success).toBe(true);
    expect(CreatePassInput.safeParse({ passTypeId: "passtypeschool01", homeStopId: id("a"), destStopId: id("b") }).success).toBe(true);
    expect(CreatePassInput.safeParse({ passTypeId: "passtypeschool01", homeStopId: id("a") }).success).toBe(false);
    expect(CreatePassInput.safeParse({ passTypeId: "passtypeschool01", homeStopId: id("a"), destStopId: id("a") }).success).toBe(false);
    expect(CreatePassInput.safeParse({ passTypeId: "passtypeday00001", pricePaise: 1 }).success).toBe(false);
  });

  it("student check refuses any extra field, so no ID number can be sent", () => {
    const ok = { consent: true, declaration: { isStudent: true, institutionName: "Govt College" } };
    expect(StudentCheckInput.safeParse(ok).success).toBe(true);
    expect(StudentCheckInput.safeParse({ ...ok, studentId: "S1" }).success).toBe(false);
    expect(StudentCheckInput.safeParse({ ...ok, declaration: { ...ok.declaration, rollNo: "12" } }).success).toBe(false);
  });

  it("an admin patch changes rules, never kind, scheme or state, and never nothing", () => {
    expect(AdminPassTypePatch.safeParse({ pricePaise: 15000 }).success).toBe(true);
    expect(AdminPassTypePatch.safeParse({}).success).toBe(false);
    expect(AdminPassTypePatch.safeParse({ kind: "ANNUAL" }).success).toBe(false);
    expect(AdminPassTypePatch.safeParse({ scheme: "STUDENT" }).success).toBe(false);
    expect(AdminPassTypePatch.safeParse({ groupSize: 11 }).success).toBe(false);
  });
});
