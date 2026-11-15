// Prepares a chosen picture for upload in the browser (spec 28, R42): crops it to the middle square,
// scales it to 256 x 256 on a canvas and encodes it again as JPEG (PNG if the browser cannot write
// JPEG). Drawing on a canvas keeps only the pixels, so location data and every other note in the file
// are dropped. The server checks the result again and never relies on this.

export const PHOTO_SIDE = 256;
/** The server's limit, checked here too so a too large result is not even sent. */
const MAX_BYTES = 200_000;

/** The middle square of a picture of this size: where to cut it out. */
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

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function base64Of(bytes: Uint8Array): string {
  let text = "";
  // In pieces, so a large picture does not overflow the arguments of fromCharCode.
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

/** The picture as base64 text, ready for POST /api/profile/photo. Throws PhotoUnreadableError. */
export async function preparePhoto(file: File): Promise<string> {
  let picture: ImageBitmap;
  try {
    // Turned upright the way the file says (photos from phones).
    picture = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PhotoUnreadableError();
  }
  const canvas = document.createElement("canvas");
  canvas.width = PHOTO_SIDE;
  canvas.height = PHOTO_SIDE;
  const context = canvas.getContext("2d");
  if (!context) throw new PhotoUnreadableError();
  const { x, y, side } = middleSquare(picture.width, picture.height);
  // A white background for pictures with transparent parts, as JPEG has no transparency.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, PHOTO_SIDE, PHOTO_SIDE);
  context.imageSmoothingQuality = "high";
  context.drawImage(picture, x, y, side, side, 0, 0, PHOTO_SIDE, PHOTO_SIDE);
  picture.close();

  let blob = await toBlob(canvas, "image/jpeg", 0.85);
  if (!blob || blob.type !== "image/jpeg") blob = await toBlob(canvas, "image/png");
  if (!blob || blob.size > MAX_BYTES) throw new PhotoUnreadableError();
  return base64Of(new Uint8Array(await blob.arrayBuffer()));
}
