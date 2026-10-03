import { createHmac, generateKeyPairSync, randomBytes } from "node:crypto";
import type { ConfigService } from "@nestjs/config";
import { buildQrContent, QR_PERIOD_SEC, qrStep, rotatingCode } from "@aptransit/shared";
import { describe, expect, it } from "vitest";
import type { Env } from "../../config/env";
import { QrService } from "./qr.service";

function service(keyId = "k1", pem = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString()) {
  const values: Record<string, string> = {
    QR_SIGNING_KEY_ID: keyId,
    QR_SIGNING_PRIVATE_KEY: Buffer.from(pem).toString("base64"),
    QR_SECRET_KEY: randomBytes(32).toString("base64"),
  };
  return new QrService({ get: (key: string) => values[key] } as unknown as ConfigService<Env, true>);
}

const hmac = (key: Uint8Array, message: Uint8Array) => new Uint8Array(createHmac("sha256", key).update(message).digest());
const payload = { t: "T" as const, i: "ticket0000001", tr: "trip000000001", d: "2026-10-04", v: 1_791_000_000 };

describe("QrService", () => {
  it("signs and verifies a token", () => {
    const qr = service();
    const token = qr.signToken(payload);
    expect(token.startsWith("APT1.")).toBe(true);
    expect(qr.verifyToken(token)).toEqual({ ...payload, k: "k1" });
  });

  it("rejects a tampered payload", () => {
    const qr = service();
    const [prefix, , signature] = qr.signToken(payload).split(".");
    const forged = Buffer.from(JSON.stringify({ ...payload, i: "someoneelse01", k: "k1" })).toString("base64url");
    expect(qr.verifyToken(`${prefix}.${forged}.${signature}`)).toBeNull();
  });

  it("rejects a token signed with another key or an unknown key id", () => {
    const ours = service("k1");
    expect(ours.verifyToken(service("k1").signToken(payload))).toBeNull();
    expect(ours.verifyToken(service("k2").signToken(payload))).toBeNull();
  });

  it("rejects garbage", () => {
    const qr = service();
    for (const bad of ["", "APT1", "APT1.x.y", "APT2.e30.e30", `${qr.signToken(payload)}.extra`]) {
      expect(qr.verifyToken(bad)).toBeNull();
    }
  });

  it("round trips the sealed rot secret", () => {
    const qr = service();
    expect(qr.decryptRotSecret(qr.newRotSecret())).toHaveLength(32);
  });

  it("accepts the previous, current and next step only", async () => {
    const qr = service();
    const secret = qr.decryptRotSecret(qr.newRotSecret());
    const now = 1_791_000_000_000;
    const step = qrStep(now);
    const codeAt = (s: number) => rotatingCode(hmac, secret, s);

    expect(await qr.verifyCode(secret, await codeAt(step), now)).toBe(true);
    expect(await qr.verifyCode(secret, await codeAt(step - 1), now)).toBe(true);
    expect(await qr.verifyCode(secret, await codeAt(step + 1), now)).toBe(true);
    // A screenshot two steps old is stale
    expect(await qr.verifyCode(secret, await codeAt(step - 2), now)).toBe(false);
    expect(await qr.verifyCode(secret, await codeAt(step), now + 2 * QR_PERIOD_SEC * 1000)).toBe(false);
    expect(await qr.verifyCode(randomBytes(32), await codeAt(step), now)).toBe(false);
  });

  it("checks full scan content", async () => {
    const qr = service();
    const token = qr.signToken(payload);
    expect(await qr.verifyContent("hello")).toBe("NOT_FOUND");
    const forged = token.slice(0, -4) + "AAAA";
    expect(await qr.verifyContent(buildQrContent(forged, "ABCDEFGH"))).toBe("BAD_SIGNATURE");
    expect(await qr.verifyContent(buildQrContent(token, "ABCDEFGH"))).toMatchObject({ code: "ABCDEFGH", payload: { i: payload.i } });
  });
});
