// The two-finger zoom of the time grid: a zoomed hour height moves every position, a missing one keeps
// the normal height, and the height stays within its limits.
import { describe, expect, it } from "vitest";
import { minuteAtY } from "./drag";
import { blockBox, clampHourPx, HOUR_PX, MAX_HOUR_PX, MIN_HOUR_PX, minuteToPx, rangeHeight, slotAt } from "./grid";

const range = { startMin: 7 * 60, endMin: 22 * 60 };
const zoomed = { ...range, hourPx: 120 };

describe("zoomed hours", () => {
  it("without a zoom everything uses the normal hour height", () => {
    expect(minuteToPx(9 * 60, range)).toBe(2 * HOUR_PX);
    expect(rangeHeight(range)).toBe(15 * HOUR_PX);
  });

  it("with a zoom, positions, heights, clicks and drags all use the zoomed hour", () => {
    expect(minuteToPx(9 * 60, zoomed)).toBe(240);
    expect(rangeHeight(zoomed)).toBe(15 * 120);
    expect(blockBox({ startMin: 9 * 60, endMin: 10 * 60 + 30 }, zoomed)).toEqual({ top: 240, height: 180 });
    expect(slotAt(2.5 * 120, zoomed)).toEqual({ startMin: 9 * 60 + 30, endMin: 10 * 60 + 30 });
    expect(minuteAtY(3 * 120, zoomed)).toBe(10 * 60);
  });

  it("keeps the hour height between the limits; a value that is not a number gives the normal height", () => {
    expect(clampHourPx(10)).toBe(MIN_HOUR_PX);
    expect(clampHourPx(1000)).toBe(MAX_HOUR_PX);
    expect(clampHourPx(90)).toBe(90);
    expect(clampHourPx(Number("abc"))).toBe(HOUR_PX);
  });
});
