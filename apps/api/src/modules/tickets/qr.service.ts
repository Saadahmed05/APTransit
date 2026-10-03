import { createHmac, createPrivateKey, createPublicKey, type KeyObject, randomBytes, sign, timingSafeEqual, verify } from "node:crypto";
import { QR_PERIOD_SEC, QR_PREFIX, QrPayload, parseQrContent, qrStep, rotatingCode } from "@aptransit/shared";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { openSecret, sealSecret } from "../../common/crypto/secret-box";
import type { Env } from "../../config/env";

const nodeHmac = (key: Uint8Array, message: Uint8Array) => new Uint8Array(createHmac("sha256", key).update(message).digest());

/**
 * ADR 003: APT1.<payload>.<ed25519 signature> plus a rotating code from a per ticket secret.
 * The signature covers "APT1.<payload>". Old keys can be added to `publicKeys` when keys rotate.
 */
@Injectable()
export class QrService {
  readonly keyId: string;
  private readonly privateKey: KeyObject;
  private readonly publicKeys: Map<string, KeyObject>;
  private readonly secretKey: string;

  constructor(config: ConfigService<Env, true>) {
    this.keyId = config.get("QR_SIGNING_KEY_ID", { infer: true });
    const pem = Buffer.from(config.get("QR_SIGNING_PRIVATE_KEY", { infer: true }), "base64").toString("utf8");
    this.privateKey = createPrivateKey(pem);
    this.publicKeys = new Map([[this.keyId, createPublicKey(this.privateKey)]]);
    this.secretKey = config.get("QR_SECRET_KEY", { infer: true });
  }

  signToken(payload: Omit<QrPayload, "k">): string {
    const body = Buffer.from(JSON.stringify({ ...payload, k: this.keyId })).toString("base64url");
    const signed = `${QR_PREFIX}.${body}`;
    return `${signed}.${sign(null, Buffer.from(signed), this.privateKey).toString("base64url")}`;
  }

  /** The payload when the token is ours and untouched, else null (scan reason BAD_SIGNATURE). */
  verifyToken(token: string): QrPayload | null {
    const [prefix, body, signature, extra] = token.split(".");
    if (prefix !== QR_PREFIX || !body || !signature || extra !== undefined) return null;
    let payload: QrPayload;
    try {
      const parsed = QrPayload.safeParse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
      if (!parsed.success) return null;
      payload = parsed.data;
    } catch {
      return null;
    }
    const key = this.publicKeys.get(payload.k);
    if (!key) return null;
    const ok = verify(null, Buffer.from(`${prefix}.${body}`), key, Buffer.from(signature, "base64url"));
    return ok ? payload : null;
  }

  /** A new rotating secret, sealed for the tickets.qrSecret column. */
  newRotSecret(): string {
    return sealSecret(randomBytes(32), this.secretKey);
  }

  decryptRotSecret(sealed: string): Buffer {
    return openSecret(sealed, this.secretKey);
  }

  /** Accepts the code for steps current minus 1 to current plus 1 (about 60 s either side at most). */
  async verifyCode(rotSecret: Uint8Array, code: string, nowMs: number): Promise<boolean> {
    const current = qrStep(nowMs, 0, QR_PERIOD_SEC);
    let match = false;
    for (const step of [current - 1, current, current + 1]) {
      const expected = Buffer.from(await rotatingCode(nodeHmac, rotSecret, step));
      const received = Buffer.from(code);
      // Check every step so the timing does not tell which one matched
      if (expected.length === received.length && timingSafeEqual(expected, received)) match = true;
    }
    return match;
  }

  /** Scan content: parse and signature. The code needs the ticket secret (verifyCode); status checks are the scanner's (Day 12). */
  async verifyContent(text: string): Promise<{ payload: QrPayload; code: string } | "NOT_FOUND" | "BAD_SIGNATURE"> {
    const parsed = parseQrContent(text);
    if (!parsed) return "NOT_FOUND";
    const payload = this.verifyToken(parsed.token);
    if (!payload) return "BAD_SIGNATURE";
    return { payload, code: parsed.code };
  }
}
