import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openSecret, sealSecret } from "./secret-box";

describe("secret box (AES 256 GCM)", () => {
  const key = randomBytes(32).toString("base64");

  it("round trips and never stores the plain value", () => {
    const plain = randomBytes(32);
    const sealed = sealSecret(plain, key);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain(plain.toString("base64url"));
    expect(openSecret(sealed, key).equals(plain)).toBe(true);
  });

  it("uses a fresh iv every time", () => {
    const plain = randomBytes(32);
    expect(sealSecret(plain, key)).not.toBe(sealSecret(plain, key));
  });

  it("rejects a tampered value or another key", () => {
    const sealed = sealSecret(randomBytes(32), key);
    const parts = sealed.split(".");
    const tampered = [...parts.slice(0, 3), Buffer.from("x".repeat(32)).toString("base64url")].join(".");
    expect(() => openSecret(tampered, key)).toThrow();
    expect(() => openSecret(sealed, randomBytes(32).toString("base64"))).toThrow();
    expect(() => openSecret("v0.a.b.c", key)).toThrow();
  });
});
