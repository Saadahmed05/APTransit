import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES 256 GCM for secrets at rest (ticket qrSecret, docs/05). Stored as
// "v1.<iv>.<tag>.<ciphertext>", each part base64url. The key is QR_SECRET_KEY (32 bytes, base64).

const VERSION = "v1";
const IV_BYTES = 12;

function keyFrom(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) throw new Error("secret box key must be 32 bytes");
  return key;
}

export function sealSecret(plain: Buffer, keyBase64: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(keyBase64), iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

/** Throws when the value was changed or sealed with another key. */
export function openSecret(sealed: string, keyBase64: string): Buffer {
  const [version, iv, tag, ciphertext] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) {
    throw new Error("unknown secret box format");
  }
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(keyBase64), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]);
}
