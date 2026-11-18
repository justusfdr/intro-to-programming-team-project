// Spec 47 v3: a widget dragged in from the gallery lands as near as it can to where it is let go, and the
// small "time to leave" tile writes long times so they fit.
import { describe, expect, it } from "vitest";
import { insertAt, pack, spotFor } from "./layout";
import { leaveLine, shortDuration } from "./leave";
import { DEFAULT_LAYOUT, type WidgetItem } from "./types";

const small = (kind: WidgetItem["kind"]): WidgetItem => ({ kind, size: "1x1" });

describe("spotFor: where a dragged widget lands", () => {
  const list: WidgetItem[] = [{ kind: "weather", size: "3x2" }, small("focus")];

  it("puts a small widget into the field it is let go over", () => {
    const at = spotFor(list, small("leave"), 6, { row: 2, col: 2 });
    expect(at).not.toBeNull();
    const placed = pack(insertAt(list, small("leave"), at!), 6).placed.find((p) => p.index === at);
    expect([placed?.row, placed?.col]).toEqual([2, 1]); // field 2,2 is only reachable after 2,1 fills; nearest is 2,1
  });

  it("puts it before the others when let go at the top", () => {
    expect(spotFor(list, small("leave"), 6, { row: 0, col: 0 })).toBe(0);
  });

  it("puts a wide widget into the row it is let go over", () => {
    const at = spotFor(list, { kind: "free", size: "3x1" }, 6, { row: 3, col: 1 });
    const placed = pack(insertAt(list, { kind: "free", size: "3x1" }, at!), 6).placed.find((p) => p.index === at);
    expect([placed?.row, placed?.col]).toEqual([3, 0]);
  });

  it("finds no room in a full grid, or where it would push another widget off a short screen", () => {
    expect(spotFor(DEFAULT_LAYOUT, small("focus"), 6, { row: 0, col: 0 })).toBeNull();
    expect(spotFor(list, { kind: "next", size: "3x4" }, 4, { row: 0, col: 0 })).toBeNull();
  });
});

describe("shortDuration: the small leave tile", () => {
  it("keeps to about six characters", () => {
    expect(shortDuration(26)).toBe("26 min");
    expect(shortDuration(120)).toBe("2 h");
    expect(shortDuration(326)).toBe("5h 26m");
  });
});

describe("leaveLine, short: the leave row inside Next up", () => {
  it("writes hours short so the time beside it stays visible", () => {
    expect(leaveLine(326, true)).toBe("Leave in 5h 26m");
    expect(leaveLine(12, true)).toBe("Leave in 12 min");
    expect(leaveLine(-75, true)).toBe("1h 15m late");
  });
});
