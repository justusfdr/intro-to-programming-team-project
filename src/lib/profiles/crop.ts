// Placing a profile photo before it is saved (spec 40, "Positioning the photo"): the
// square frame of the dialog shows the picture scaled and moved; what lies inside the frame becomes the
// photo. All the geometry is here, pure and tested in crop.test.ts; the dialog only draws it.
//
// Words: `width` and `height` are the picture's own size in pixels (upright, as the file says). `frame`
// is the side of the square frame on the screen. `zoom` 1 means "fits the frame": the picture's shorter
// side fills the frame exactly, so the frame is always covered; 4 is four times that. `x` and `y` are
// where the picture's top-left corner lies, in screen pixels from the frame's top-left corner; they are
// never positive and never so negative that the frame would show empty space.

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
/** One press of the zoom's plus or minus button. */
export const ZOOM_STEP = 0.25;
/** One press of an arrow key moves the picture this many screen pixels; with Shift, the larger step. */
export const MOVE_STEP = 8;
export const MOVE_STEP_LARGE = 40;

export type CropPlace = { zoom: number; x: number; y: number };

/** Where to cut the photo out of the picture, in the picture's own pixels (for the canvas's drawImage). */
export type SourceRect = { sx: number; sy: number; sWidth: number; sHeight: number };

/** A zoom between the limits; anything that is not a number counts as "fits the frame". */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MIN_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Screen pixels per picture pixel at this zoom. */
export function scaleOf(width: number, height: number, frame: number, zoom: number): number {
  return (frame / Math.min(width, height)) * clampZoom(zoom);
}

/** The picture's size on the screen at this zoom. */
export function shownSize(width: number, height: number, frame: number, zoom: number): { width: number; height: number } {
  const scale = scaleOf(width, height, frame, zoom);
  return { width: width * scale, height: height * scale };
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** The place with its zoom inside the limits and the picture moved back so the frame is covered. */
export function clampPlace(width: number, height: number, frame: number, place: CropPlace): CropPlace {
  const zoom = clampZoom(place.zoom);
  const shown = shownSize(width, height, frame, zoom);
  const x = Number.isFinite(place.x) ? place.x : 0;
  const y = Number.isFinite(place.y) ? place.y : 0;
  return { zoom, x: clamp(x, frame - shown.width, 0), y: clamp(y, frame - shown.height, 0) };
}

/** The starting place: fits the frame, centred (the middle square, as photos were cut before). */
export function centredPlace(width: number, height: number, frame: number): CropPlace {
  const shown = shownSize(width, height, frame, MIN_ZOOM);
  return { zoom: MIN_ZOOM, x: (frame - shown.width) / 2, y: (frame - shown.height) / 2 };
}

/** A new zoom around the frame's centre: the point of the picture in the middle stays in the middle. */
export function zoomTo(width: number, height: number, frame: number, place: CropPlace, nextZoom: number): CropPlace {
  const from = clampPlace(width, height, frame, place);
  const zoom = clampZoom(nextZoom);
  const before = scaleOf(width, height, frame, from.zoom);
  const after = scaleOf(width, height, frame, zoom);
  const middle = frame / 2;
  // The picture's point under the frame's centre, in picture pixels.
  const px = (middle - from.x) / before;
  const py = (middle - from.y) / before;
  return clampPlace(width, height, frame, { zoom, x: middle - px * after, y: middle - py * after });
}

/** The picture moved by a number of screen pixels (a drag, or an arrow key), never past the frame. */
export function moveBy(width: number, height: number, frame: number, place: CropPlace, dx: number, dy: number): CropPlace {
  return clampPlace(width, height, frame, { zoom: place.zoom, x: place.x + dx, y: place.y + dy });
}

/** How far an arrow key moves the picture; null for any other key. The picture moves the way the arrow points. */
export function arrowStep(key: string, large: boolean): { dx: number; dy: number } | null {
  const step = large ? MOVE_STEP_LARGE : MOVE_STEP;
  if (key === "ArrowLeft") return { dx: -step, dy: 0 };
  if (key === "ArrowRight") return { dx: step, dy: 0 };
  if (key === "ArrowUp") return { dx: 0, dy: -step };
  if (key === "ArrowDown") return { dx: 0, dy: step };
  return null;
}

/**
 * What the frame shows, as the square to cut out of the picture: never outside the picture, never larger
 * than its shorter side. The place is clamped first, so any place gives a whole photo.
 */
export function sourceRect(width: number, height: number, frame: number, place: CropPlace): SourceRect {
  const { zoom, x, y } = clampPlace(width, height, frame, place);
  const scale = scaleOf(width, height, frame, zoom);
  const side = Math.min(frame / scale, width, height);
  const sx = clamp(-x / scale, 0, width - side);
  const sy = clamp(-y / scale, 0, height - side);
  return { sx, sy, sWidth: side, sHeight: side };
}

/** The clamped place and its square together: what the dialog keeps after every change. */
export function placeCrop(width: number, height: number, frame: number, place: CropPlace): { place: CropPlace; source: SourceRect } {
  const clamped = clampPlace(width, height, frame, place);
  return { place: clamped, source: sourceRect(width, height, frame, clamped) };
}
