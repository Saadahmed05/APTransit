import { buildQrContent, type HmacSha256, qrStep, rotatingCode } from "@aptransit/shared";

// docs/07 section 4: the device computes the rotating code from rotSecret with Web Crypto.
// The same shared helper runs on the API with Node crypto, so both agree byte for byte.

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export const webHmac: HmacSha256 = async (key, message) => {
  const cryptoKey = await crypto.subtle.importKey("raw", new Uint8Array(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, new Uint8Array(message)));
};

/** QR content for the step at `nowMs`, with the device clock corrected by serverOffsetMs. */
export async function qrContentAt(token: string, rotSecret: string, nowMs: number, serverOffsetMs: number, periodSec: number): Promise<string> {
  const step = qrStep(nowMs, serverOffsetMs, periodSec);
  return buildQrContent(token, await rotatingCode(webHmac, base64UrlToBytes(rotSecret), step));
}

/** serverTime minus the device clock when the answer arrived, measured once per QR fetch. */
export function serverOffsetMs(serverTime: string, receivedAtMs: number): number {
  const server = Date.parse(serverTime);
  return Number.isFinite(server) ? server - receivedAtMs : 0;
}
