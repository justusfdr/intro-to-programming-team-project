// A profile photo (spec 28, R42): JPEG, PNG or WebP, at most 200,000 bytes. The type is decided from
// the first bytes only, never from a file name or the type the browser claims. The database checks
// the same (app.photo_mime and the table's checks).

export const MAX_PHOTO_BYTES = 200_000;

export type PhotoType = "image/jpeg" | "image/png" | "image/webp";

const starts = (bytes: Uint8Array, prefix: readonly number[], at = 0) =>
  bytes.length >= at + prefix.length && prefix.every((b, i) => bytes[at + i] === b);

/** The photo's type from its magic bytes, or null for anything else. */
export function photoTypeOf(bytes: Uint8Array): PhotoType | null {
  if (starts(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // "RIFF", four bytes of length, "WEBP".
  if (starts(bytes, [0x52, 0x49, 0x46, 0x46]) && starts(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

export type PhotoCheck = { ok: true; type: PhotoType } | { ok: false; reason: "too_large" | "wrong_type" };

/** The checks of an uploaded photo, in the order the server makes them: size first, then type. */
export function checkPhoto(bytes: Uint8Array): PhotoCheck {
  if (bytes.length > MAX_PHOTO_BYTES) return { ok: false, reason: "too_large" };
  const type = photoTypeOf(bytes);
  return type ? { ok: true, type } : { ok: false, reason: "wrong_type" };
}

/** Strict base64 (no spaces, no line breaks, padded): the shape the browser sends a photo in. */
export function isStrictBase64(text: string): boolean {
  return text.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(text);
}
