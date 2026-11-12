import "server-only";

// Authenticated encryption for what we keep from Microsoft (the refresh token) and for the short
// sign-in cookie: AES-256-GCM, a fresh random 12-byte nonce every time, and a purpose string bound in
// as associated data (for the token: the user's id, so a value copied to another row cannot be opened).
// The result: "v1.<nonce>.<ciphertext and tag>", base64url. Plain values are never logged.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";

/** The 32-byte AES key from the configured key material (at least 32 bytes, checked in config.ts). */
function aesKey(material: Buffer): Buffer {
  if (material.length < 32) throw new Error("The Outlook key must have at least 32 bytes.");
  return createHash("sha256").update(material).digest();
}

export function seal(plain: string, purpose: string, keyMaterial: Buffer): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey(keyMaterial), nonce);
  cipher.setAAD(Buffer.from(purpose, "utf8"));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return `${VERSION}.${nonce.toString("base64url")}.${body.toString("base64url")}`;
}

/** The plain value, or null when the value was changed, sealed for another purpose or with another key. */
export function open(sealed: string, purpose: string, keyMaterial: Buffer): string | null {
  const parts = sealed.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  const nonce = Buffer.from(parts[1], "base64url");
  const body = Buffer.from(parts[2], "base64url");
  if (nonce.length !== 12 || body.length < 16) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", aesKey(keyMaterial), nonce);
    decipher.setAAD(Buffer.from(purpose, "utf8"));
    decipher.setAuthTag(body.subarray(body.length - 16));
    return Buffer.concat([decipher.update(body.subarray(0, body.length - 16)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** The purpose for a user's stored Outlook access. */
export const tokenPurpose = (userId: string) => `outlook-token:${userId}`;
/** The purpose for the sign-in cookie of a user. */
export const signInPurpose = (userId: string) => `outlook-sign-in:${userId}`;
