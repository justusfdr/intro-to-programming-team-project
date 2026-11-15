// Prepares a chosen picture for upload in the browser (spec 40, R42): reads it upright (photos from
// phones say how they were held), cuts out the square the user placed in the dialog (spec 40,
// "Positioning the photo"; at first the middle square), scales it to 256 x 256 on a canvas and encodes
// it again as JPEG, lowering the quality until it fits the server's limit (PNG if the browser cannot
// write JPEG). Drawing on a canvas keeps only the pixels, so location data and every other note in the
// file are dropped. The server checks the result again and never relies on this.
import type { SourceRect } from "@/lib/profiles/crop";

export const PHOTO_SIDE = 256;
/** The server's limit, checked here too so a too large result is not even sent. */
const MAX_BYTES = 200_000;

/** The middle square of a picture of this size: where the dialog starts (lib/profiles/crop.ts, centredPlace). */
export function middleSquare(width: number, height: number): { x: number; y: number; side: number } {
  const side = Math.min(width, height);
  return { x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), side };
}

export class PhotoUnreadableError extends Error {
  constructor() {
    super("This picture cannot be read. Choose a JPEG, PNG or WebP image.");
    this.name = "PhotoUnreadableError";
  }
}

export class PhotoTooLargeError extends Error {
  constructor() {
    super("This photo is too large even after shrinking it. Choose another picture.");
    this.name = "PhotoTooLargeError";
  }
}

/** JPEG qualities tried in turn until the photo fits the limit. */
const QUALITIES = [0.85, 0.75, 0.65, 0.5, 0.35];

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function base64Of(bytes: Uint8Array): string {
  let text = "";
  // In pieces, so a large picture does not overflow the arguments of fromCharCode.
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

/** A chosen picture, read and turned upright; `close` frees it. */
export type Picture = { image: CanvasImageSource; width: number; height: number; close: () => void };

/** Only pictures are read at all: anything else is refused before the dialog opens. */
export function looksLikePicture(file: { type: string }): boolean {
  return file.type.startsWith("image/");
}

/**
 * Reads the chosen file as a picture, upright the way the file says. Where the browser cannot do that
 * with createImageBitmap, an <img> element is used (browsers turn those upright too). Throws
 * PhotoUnreadableError for anything that is not a readable picture.
 */
export async function loadPicture(file: File): Promise<Picture> {
  if (!looksLikePicture(file)) throw new PhotoUnreadableError();
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    if (bitmap.width > 0 && bitmap.height > 0) return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    bitmap.close();
  } catch {
    // Falls back to an <img> below.
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (img.naturalWidth === 0 || img.naturalHeight === 0) throw new PhotoUnreadableError();
    return { image: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } catch {
    throw new PhotoUnreadableError();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The placed square of the picture as base64 text, ready for POST /api/profile/photo. Throws
 * PhotoUnreadableError when the browser cannot draw it, PhotoTooLargeError when no quality fits.
 */
export async function encodePhoto(picture: Picture, source: SourceRect): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = PHOTO_SIDE;
  canvas.height = PHOTO_SIDE;
  const context = canvas.getContext("2d");
  if (!context) throw new PhotoUnreadableError();
  // A white background for pictures with transparent parts, as JPEG has no transparency.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, PHOTO_SIDE, PHOTO_SIDE);
  context.imageSmoothingQuality = "high";
  context.drawImage(picture.image, source.sx, source.sy, source.sWidth, source.sHeight, 0, 0, PHOTO_SIDE, PHOTO_SIDE);

  let blob: Blob | null = null;
  for (const quality of QUALITIES) {
    blob = await toBlob(canvas, "image/jpeg", quality);
    if (!blob || blob.type !== "image/jpeg" || blob.size <= MAX_BYTES) break;
  }
  if (!blob || blob.type !== "image/jpeg") blob = await toBlob(canvas, "image/png");
  if (!blob) throw new PhotoUnreadableError();
  if (blob.size > MAX_BYTES) throw new PhotoTooLargeError();
  return base64Of(new Uint8Array(await blob.arrayBuffer()));
}
