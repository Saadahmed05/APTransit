import { z } from "zod";

// docs/07 section 4 and ADR 003. QR content = APT1.<payload>.<signature>~<code>.
// The rotating code is base32(HMAC_SHA256(rotSecret, step)).slice(0, 8), step = 30 s window.
// HMAC is injected: the web passes Web Crypto, the API passes Node crypto.

export const QR_PREFIX = "APT1";
export const QR_PERIOD_SEC = 30;
export const QR_CODE_LENGTH = 8;

/** RFC 4648 base32 alphabet. */
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Signed payload inside the token. */
export const QrPayload = z.object({
  /** T ticket, P pass */
  t: z.enum(["T", "P"]),
  i: z.string().min(1),
  tr: z.string().nullable(),
  /** Service date YYYY-MM-DD (IST), or null for passes */
  d: z.string().nullable(),
  /** validUntil, epoch seconds */
  v: z.number().int(),
  /** Signing key id */
  k: z.string().min(1),
});
export type QrPayload = z.infer<typeof QrPayload>;

/** (key, message) to HMAC SHA 256 digest. */
export type HmacSha256 = (key: Uint8Array, message: Uint8Array) => Promise<Uint8Array> | Uint8Array;

/** Time step for a moment, after correcting the device clock by offsetMs (serverTime minus device time). */
export function qrStep(nowMs: number, offsetMs = 0, periodSec = QR_PERIOD_SEC): number {
  return Math.floor((nowMs + offsetMs) / 1000 / periodSec);
}

/** The HMAC message for a step: 8 bytes, big endian (as in TOTP). */
export function stepMessage(step: number): Uint8Array {
  if (!Number.isSafeInteger(step) || step < 0) throw new RangeError("step must be a non negative safe integer");
  const bytes = new Uint8Array(8);
  let rest = step;
  for (let i = 7; i >= 0; i--) {
    bytes[i] = rest % 256;
    rest = Math.floor(rest / 256);
  }
  return bytes;
}

/** First QR_CODE_LENGTH base32 characters of the HMAC digest. */
export function formatCode(hmacBytes: Uint8Array): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of hmacBytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < QR_CODE_LENGTH) {
      out += BASE32[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
    buffer &= (1 << bits) - 1;
    if (out.length === QR_CODE_LENGTH) break;
  }
  if (out.length < QR_CODE_LENGTH) throw new RangeError("digest too short for a code");
  return out;
}

export async function rotatingCode(hmac: HmacSha256, rotSecret: Uint8Array, step: number): Promise<string> {
  return formatCode(await hmac(rotSecret, stepMessage(step)));
}

export function buildQrContent(token: string, code: string): string {
  return `${token}~${code}`;
}

export interface ParsedQr {
  token: string;
  /** base64url payload and signature parts of the token */
  payloadPart: string;
  signaturePart: string;
  code: string;
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;
const CODE = new RegExp(`^[A-Z2-7]{${QR_CODE_LENGTH}}$`);

/** Null when the text is not APT1.<payload>.<signature>~<code> (scan reason NOT_FOUND). */
export function parseQrContent(text: string): ParsedQr | null {
  const [token, code, extra] = text.trim().split("~");
  if (!token || !code || extra !== undefined || !CODE.test(code)) return null;
  const [prefix, payloadPart, signaturePart, more] = token.split(".");
  if (prefix !== QR_PREFIX || !payloadPart || !signaturePart || more !== undefined) return null;
  if (!BASE64URL.test(payloadPart) || !BASE64URL.test(signaturePart)) return null;
  return { token, payloadPart, signaturePart, code };
}
