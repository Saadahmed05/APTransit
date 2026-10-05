import { rotatingCode } from "@aptransit/shared";
import { describe, expect, it } from "vitest";
import { base64UrlToBytes, qrContentAt, serverOffsetMs, webHmac } from "./qr-code";

// The same fixed vectors as packages/shared/src/qr.test.ts: the browser and the API must agree.
const key = Uint8Array.from({ length: 32 }, (_, i) => i);
const keyB64Url = Buffer.from(key).toString("base64url");

describe("qr-code (Web Crypto)", () => {
  it("decodes base64url secrets", () => {
    expect(Array.from(base64UrlToBytes(keyB64Url))).toEqual(Array.from(key));
    expect(Array.from(base64UrlToBytes("_-8"))).toEqual([0xff, 0xef]);
  });

  it("matches the shared fixed vectors", async () => {
    expect(await rotatingCode(webHmac, key, 0)).toBe("T4GNTOKA");
    expect(await rotatingCode(webHmac, key, 59_468_224)).toBe("N543ERAX");
  });

  it("builds token~code for the step at a moment, corrected by the server offset", async () => {
    // step 1 covers 30 s to 60 s; the device clock is 20 s behind the server
    expect(await qrContentAt("APT1.a.b", keyB64Url, 15_000, 20_000, 30)).toBe("APT1.a.b~YQZOAWOD");
  });

  it("serverOffsetMs is server minus device, 0 when the time is unreadable", () => {
    expect(serverOffsetMs("2026-10-05T00:00:10.000Z", Date.parse("2026-10-05T00:00:00.000Z"))).toBe(10_000);
    expect(serverOffsetMs("not a date", 0)).toBe(0);
  });
});
