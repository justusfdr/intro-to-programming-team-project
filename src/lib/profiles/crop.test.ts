// Placing the profile photo (spec 31, "Positioning the photo"): fits the frame for every shape, the zoom
// limits, the clamp that never shows empty space, zooming around the centre, the arrow keys, and a square
// to cut out that never leaves the picture.
import { describe, expect, it } from "vitest";
import { middleSquare } from "@/lib/client/resize-photo";
import {
  arrowStep,
  centredPlace,
  clampPlace,
  clampZoom,
  MAX_ZOOM,
  MIN_ZOOM,
  MOVE_STEP,
  MOVE_STEP_LARGE,
  moveBy,
  placeCrop,
  shownSize,
  sourceRect,
  zoomTo,
} from "./crop";

const FRAME = 280;
const SHAPES = [
  { name: "landscape", width: 4000, height: 3000 },
  { name: "portrait", width: 1080, height: 1920 },
  { name: "square", width: 256, height: 256 },
  { name: "small and wide", width: 101, height: 100 },
];

function inside(width: number, height: number, s: { sx: number; sy: number; sWidth: number; sHeight: number }) {
  expect(s.sWidth).toBeCloseTo(s.sHeight, 9);
  expect(s.sx).toBeGreaterThanOrEqual(0);
  expect(s.sy).toBeGreaterThanOrEqual(0);
  expect(s.sx + s.sWidth).toBeLessThanOrEqual(width + 1e-9);
  expect(s.sy + s.sHeight).toBeLessThanOrEqual(height + 1e-9);
  expect(s.sWidth).toBeGreaterThan(0);
}

describe("fits the frame", () => {
  it.each(SHAPES)("$name: the shorter side fills the frame at zoom 1, the other is at least as long", ({ width, height }) => {
    const shown = shownSize(width, height, FRAME, MIN_ZOOM);
    expect(Math.min(shown.width, shown.height)).toBeCloseTo(FRAME, 9);
    expect(Math.max(shown.width, shown.height)).toBeGreaterThanOrEqual(FRAME - 1e-9);
  });

  it("the starting place is the middle square, as photos were cut before", () => {
    for (const { width, height } of SHAPES) {
      const start = centredPlace(width, height, FRAME);
      expect(start.zoom).toBe(MIN_ZOOM);
      const s = sourceRect(width, height, FRAME, start);
      const middle = middleSquare(width, height);
      expect(s.sWidth).toBeCloseTo(middle.side, 9);
      expect(Math.abs(s.sx - middle.x)).toBeLessThan(1);
      expect(Math.abs(s.sy - middle.y)).toBeLessThan(1);
    }
  });

  it("a landscape picture can move sideways only, a portrait one up and down only, a square one not at all", () => {
    const wide = centredPlace(4000, 3000, FRAME);
    expect(moveBy(4000, 3000, FRAME, wide, 0, 50).y).toBe(0);
    expect(moveBy(4000, 3000, FRAME, wide, 30, 0).x).toBeCloseTo(wide.x + 30, 9);
    const tall = centredPlace(1080, 1920, FRAME);
    expect(moveBy(1080, 1920, FRAME, tall, 50, 0).x).toBe(0);
    expect(moveBy(1080, 1920, FRAME, tall, 0, -30).y).toBeCloseTo(tall.y - 30, 9);
    const square = centredPlace(256, 256, FRAME);
    expect(moveBy(256, 256, FRAME, square, 40, -40)).toEqual({ zoom: 1, x: 0, y: 0 });
  });
});

describe("zoom", () => {
  it("stays between fits the frame and 4 times", () => {
    expect(MIN_ZOOM).toBe(1);
    expect(MAX_ZOOM).toBe(4);
    expect(clampZoom(0.2)).toBe(1);
    expect(clampZoom(9)).toBe(4);
    expect(clampZoom(2.5)).toBe(2.5);
    expect(clampZoom(Number.NaN)).toBe(1);
  });

  it("scales around the frame's centre: the middle point of the picture stays in the middle", () => {
    const start = centredPlace(4000, 3000, FRAME);
    const zoomed = zoomTo(4000, 3000, FRAME, start, 2);
    expect(zoomed.zoom).toBe(2);
    const s1 = sourceRect(4000, 3000, FRAME, start);
    const s2 = sourceRect(4000, 3000, FRAME, zoomed);
    expect(s1.sx + s1.sWidth / 2).toBeCloseTo(s2.sx + s2.sWidth / 2, 6);
    expect(s1.sy + s1.sHeight / 2).toBeCloseTo(s2.sy + s2.sHeight / 2, 6);
    expect(s2.sWidth).toBeCloseTo(s1.sWidth / 2, 6);
  });

  it("zooming out near an edge pulls the picture back so no empty space shows", () => {
    const zoomed = zoomTo(1080, 1920, FRAME, centredPlace(1080, 1920, FRAME), 4);
    const atCorner = moveBy(1080, 1920, FRAME, zoomed, 10_000, 10_000);
    expect(atCorner.x).toBe(0);
    expect(atCorner.y).toBe(0);
    const out = zoomTo(1080, 1920, FRAME, atCorner, 1);
    const shown = shownSize(1080, 1920, FRAME, out.zoom);
    expect(out.x).toBeLessThanOrEqual(0);
    expect(out.x).toBeGreaterThanOrEqual(FRAME - shown.width);
    expect(out.y).toBeGreaterThanOrEqual(FRAME - shown.height);
  });
});

describe("the clamp", () => {
  it("never lets the frame show empty space, at any zoom and any offset", () => {
    for (const { width, height } of SHAPES) {
      for (const zoom of [1, 1.7, 4]) {
        for (const [x, y] of [
          [500, 500],
          [-1e6, -1e6],
          [20, -1e6],
          [Number.NaN, Number.POSITIVE_INFINITY],
        ]) {
          const place = clampPlace(width, height, FRAME, { zoom, x, y });
          const shown = shownSize(width, height, FRAME, place.zoom);
          expect(place.x).toBeLessThanOrEqual(0);
          expect(place.y).toBeLessThanOrEqual(0);
          expect(place.x + shown.width).toBeGreaterThanOrEqual(FRAME - 1e-9);
          expect(place.y + shown.height).toBeGreaterThanOrEqual(FRAME - 1e-9);
        }
      }
    }
  });
});

describe("the square to cut out", () => {
  it("is never outside the picture, whatever the place", () => {
    for (const { width, height } of SHAPES) {
      for (const zoom of [0, 1, 2.3, 4, 12]) {
        for (const [x, y] of [
          [0, 0],
          [1e6, -1e6],
          [-1e6, 1e6],
          [-123.4, -56.7],
        ]) {
          inside(width, height, sourceRect(width, height, FRAME, { zoom, x, y }));
        }
      }
    }
  });

  it("at 4 times it is a quarter of the shorter side; moved to the far corner it ends at the picture's edge", () => {
    const zoomed = zoomTo(4000, 3000, FRAME, centredPlace(4000, 3000, FRAME), 4);
    const { place, source } = placeCrop(4000, 3000, FRAME, moveBy(4000, 3000, FRAME, zoomed, -1e6, -1e6));
    expect(source.sWidth).toBeCloseTo(750, 6);
    expect(source.sx + source.sWidth).toBeCloseTo(4000, 6);
    expect(source.sy + source.sHeight).toBeCloseTo(3000, 6);
    expect(place.zoom).toBe(4);
  });

  it("does not depend on the frame's size (the dialog's frame is smaller on phones)", () => {
    const big = sourceRect(4000, 3000, 280, zoomTo(4000, 3000, 280, centredPlace(4000, 3000, 280), 2));
    const small = sourceRect(4000, 3000, 220, zoomTo(4000, 3000, 220, centredPlace(4000, 3000, 220), 2));
    expect(small.sx).toBeCloseTo(big.sx, 6);
    expect(small.sWidth).toBeCloseTo(big.sWidth, 6);
  });
});

describe("arrow keys", () => {
  it("move the picture the way the arrow points, further with Shift; other keys do nothing", () => {
    expect(arrowStep("ArrowLeft", false)).toEqual({ dx: -MOVE_STEP, dy: 0 });
    expect(arrowStep("ArrowRight", false)).toEqual({ dx: MOVE_STEP, dy: 0 });
    expect(arrowStep("ArrowUp", true)).toEqual({ dx: 0, dy: -MOVE_STEP_LARGE });
    expect(arrowStep("ArrowDown", true)).toEqual({ dx: 0, dy: MOVE_STEP_LARGE });
    expect(arrowStep("Enter", false)).toBeNull();
    expect(arrowStep("a", true)).toBeNull();
  });
});
