// The crop of a chosen picture (spec 28): the middle square, whatever the shape.
import { describe, expect, it } from "vitest";
import { middleSquare } from "./resize-photo";

describe("middleSquare", () => {
  it("cuts the middle of a wide, a tall and a square picture", () => {
    expect(middleSquare(4000, 3000)).toEqual({ x: 500, y: 0, side: 3000 });
    expect(middleSquare(1080, 1920)).toEqual({ x: 0, y: 420, side: 1080 });
    expect(middleSquare(256, 256)).toEqual({ x: 0, y: 0, side: 256 });
    expect(middleSquare(101, 100)).toEqual({ x: 0, y: 0, side: 100 });
  });
});
