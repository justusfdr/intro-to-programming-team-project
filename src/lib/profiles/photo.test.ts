// The photo checks (spec 40, R42): the type comes from the first bytes only; at most 200,000 bytes.
import { describe, expect, it } from "vitest";
import { checkPhoto, isStrictBase64, MAX_PHOTO_BYTES, photoTypeOf } from "./photo";

const bytes = (head: number[], fill = 20) => new Uint8Array([...head, ...new Array(fill).fill(0)]);

describe("photoTypeOf", () => {
  it("recognises JPEG, PNG and WebP by their magic bytes", () => {
    expect(photoTypeOf(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(photoTypeOf(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(photoTypeOf(bytes([0x52, 0x49, 0x46, 0x46, 9, 9, 9, 9, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
  });

  it("refuses everything else: GIF, SVG, HTML, a RIFF that is not WebP, too few bytes, nothing", () => {
    expect(photoTypeOf(bytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBeNull();
    expect(photoTypeOf(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(photoTypeOf(new TextEncoder().encode("<html><script>alert(1)</script>"))).toBeNull();
    expect(photoTypeOf(bytes([0x52, 0x49, 0x46, 0x46, 9, 9, 9, 9, 0x57, 0x41, 0x56, 0x45]))).toBeNull();
    expect(photoTypeOf(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(photoTypeOf(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42]))).toBeNull();
    expect(photoTypeOf(new Uint8Array())).toBeNull();
  });
});

describe("checkPhoto", () => {
  it("accepts a photo of exactly 200,000 bytes and refuses one byte more, size before type", () => {
    expect(checkPhoto(bytes([0xff, 0xd8, 0xff], MAX_PHOTO_BYTES - 3))).toEqual({ ok: true, type: "image/jpeg" });
    expect(checkPhoto(bytes([0xff, 0xd8, 0xff], MAX_PHOTO_BYTES - 2))).toEqual({ ok: false, reason: "too_large" });
    expect(checkPhoto(bytes([0x47, 0x49, 0x46], MAX_PHOTO_BYTES))).toEqual({ ok: false, reason: "too_large" });
    expect(checkPhoto(bytes([0x47, 0x49, 0x46]))).toEqual({ ok: false, reason: "wrong_type" });
  });
});

describe("isStrictBase64", () => {
  it("accepts padded base64 only", () => {
    expect(isStrictBase64("/9j/4A==")).toBe(true);
    expect(isStrictBase64("")).toBe(true);
    expect(isStrictBase64("/9j/4A=")).toBe(false);
    expect(isStrictBase64("/9j/\n4A==")).toBe(false);
    expect(isStrictBase64("/9j-4A==")).toBe(false);
  });
});
