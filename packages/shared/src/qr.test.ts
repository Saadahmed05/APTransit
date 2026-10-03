import { describe, expect, it } from "vitest";
import { buildQrContent, formatCode, parseQrContent, qrStep, rotatingCode, stepMessage } from "./qr";

// Web Crypto, as the browser computes it (shared has no DOM or Node types, so type it here)
interface SubtleLike {
  importKey(format: "raw", key: Uint8Array, algorithm: object, extractable: boolean, usages: string[]): Promise<unknown>;
  sign(algorithm: string, key: unknown, data: Uint8Array): Promise<ArrayBuffer>;
}
const subtle = (globalThis as unknown as { crypto: { subtle: SubtleLike } }).crypto.subtle;
const webHmac = async (key: Uint8Array, message: Uint8Array) => {
  const cryptoKey = await subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await subtle.sign("HMAC", cryptoKey, message));
};
const key = Uint8Array.from({ length: 32 }, (_, i) => i);

describe("qr helpers (docs/07 section 4)", () => {
  it("computes the 30 s step with the server clock offset", () => {
    expect(qrStep(0)).toBe(0);
    expect(qrStep(29_999)).toBe(0);
    expect(qrStep(30_000)).toBe(1);
    // The device is 10 s behind the server
    expect(qrStep(25_000, 10_000)).toBe(1);
    expect(qrStep(1_784_046_720_000)).toBe(59_468_224);
  });

  it("encodes the step as 8 bytes big endian", () => {
    expect(Array.from(stepMessage(1))).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(Array.from(stepMessage(59_468_224))).toEqual([0, 0, 0, 0, 0x03, 0x8b, 0x69, 0xc0]);
    expect(() => stepMessage(-1)).toThrow(RangeError);
  });

  it("matches fixed vectors (key 0x00..0x1f)", async () => {
    expect(await rotatingCode(webHmac, key, 0)).toBe("T4GNTOKA");
    expect(await rotatingCode(webHmac, key, 1)).toBe("YQZOAWOD");
    expect(await rotatingCode(webHmac, key, 59_468_224)).toBe("N543ERAX");
  });

  it("formats 8 base32 characters from the digest", () => {
    expect(formatCode(new Uint8Array(32))).toBe("AAAAAAAA");
    expect(formatCode(new Uint8Array(32).fill(255))).toBe("77777777");
    expect(() => formatCode(new Uint8Array(4))).toThrow(RangeError);
  });

  it("builds and parses QR content", () => {
    const content = buildQrContent("APT1.eyJ0IjoiVCJ9.c2ln_-", "T4GNTOKA");
    expect(content).toBe("APT1.eyJ0IjoiVCJ9.c2ln_-~T4GNTOKA");
    expect(parseQrContent(content)).toEqual({
      token: "APT1.eyJ0IjoiVCJ9.c2ln_-",
      payloadPart: "eyJ0IjoiVCJ9",
      signaturePart: "c2ln_-",
      code: "T4GNTOKA",
    });
  });

  it("rejects anything else", () => {
    for (const bad of [
      "",
      "APT1.a.b",
      "APT2.a.b~T4GNTOKA",
      "APT1.a~T4GNTOKA",
      "APT1.a.b.c~T4GNTOKA",
      "APT1.a.b~t4gntoka",
      "APT1.a.b~T4GNTOK",
      "APT1.a+.b~T4GNTOKA",
      "APT1.a.b~T4GNTOKA~X",
    ]) {
      expect(parseQrContent(bad)).toBeNull();
    }
  });
});
