// Spec 47 v4: a dragged widget (from the gallery or the grid itself) lands in the field it is let go
// over and keeps it; the small "time to leave" tile writes long times so they fit.
import { describe, expect, it } from "vitest";
import { checkLayout, LAYOUT_MESSAGES, nudge, pack, pinned, placeAt, resized } from "./layout";
import { leaveLine, shortDuration } from "./leave";
import { DEFAULT_LAYOUT, type WidgetItem } from "./types";

const small = (kind: WidgetItem["kind"]): WidgetItem => ({ kind, size: "1x1" });
/** Where the widget at `index` sits: [row, col]. */
const where = (list: WidgetItem[], index: number, rows = 6) => {
  const p = pack(list, rows).placed.find((x) => x.index === index);
  return p ? [p.row, p.col] : null;
};

describe("placeAt: a widget lands in the field it is let go over", () => {
  const list: WidgetItem[] = [{ kind: "weather", size: "3x2" }, small("focus")];

  it("puts a small widget into that very field, even with free fields above it", () => {
    const got = placeAt(list, small("leave"), 6, { row: 4, col: 2 })!;
    expect(where(got.layout, got.index)).toEqual([4, 2]);
    expect(where(got.layout, 2)).toEqual([2, 0]); // focus stays where it was
  });

  it("puts a wide widget into the row it is let go over", () => {
    const got = placeAt(list, { kind: "free", size: "3x1" }, 6, { row: 3, col: 1 })!;
    expect(where(got.layout, got.index)).toEqual([3, 0]);
  });

  it("over another widget: takes its field, and the other one moves to the next free place", () => {
    const got = placeAt(list, small("leave"), 6, { row: 2, col: 0 })!;
    expect(where(got.layout, got.index)).toEqual([2, 0]);
    expect(where(got.layout, 2)).toEqual([2, 1]);
  });

  it("finds no room in a full grid, or where it would push another widget off a short screen", () => {
    expect(placeAt(DEFAULT_LAYOUT, small("focus"), 6, { row: 0, col: 0 })).toBeNull();
    expect(placeAt(list, { kind: "next", size: "3x4" }, 4, { row: 0, col: 0 })).toBeNull();
  });
});

describe("moving a widget of the grid: it leaves the list and lands where it is let go", () => {
  // Three small ones in the first row, free time in the second; the rest of the grid is free.
  const list: WidgetItem[] = [small("focus"), small("leave"), small("goal"), { kind: "free", size: "3x1" }];
  const moveTo = (from: number, cell: { row: number; col: number }) => {
    // As the sidebar does: the others are pinned where they are, then the widget leaves the list.
    const got = placeAt(pinned(list, 6).filter((_, i) => i !== from), list[from], 6, cell)!;
    return { at: where(got.layout, got.index), layout: got.layout };
  };

  it("lands in a free field below the others, and stays there", () => {
    const { at, layout } = moveTo(0, { row: 4, col: 1 });
    expect(at).toEqual([4, 1]);
    // Saved and read back, it is still there.
    const saved = checkLayout(JSON.parse(JSON.stringify(layout)));
    expect(saved.ok && where(saved.layout, 0)).toEqual([4, 1]);
  });

  it("lands in the field of another widget, which makes room", () => {
    expect(moveTo(2, { row: 0, col: 0 }).at).toEqual([0, 0]);
  });

  it("a wide widget lands in the row it is let go over", () => {
    expect(moveTo(3, { row: 3, col: 1 }).at).toEqual([3, 0]);
  });

  it("the others stay where they are, even when a row above opens up", () => {
    // Moving the first small one away frees a field in the first row; nothing else moves up into it.
    const { layout } = moveTo(0, { row: 5, col: 2 });
    const at = (kind: WidgetItem["kind"]) => where(layout, layout.findIndex((w) => w.kind === kind));
    expect([at("leave"), at("goal"), at("free"), at("focus")]).toEqual([[0, 1], [0, 2], [1, 0], [5, 2]]);
  });

  it("the arrow keys move it one field, and not off the grid", () => {
    const down = nudge(list, 0, 6, { row: 1, col: 0 })!;
    expect(where(down, down.findIndex((w) => w.kind === "focus"))).toEqual([1, 0]);
    expect(nudge(list, 0, 6, { row: -1, col: 0 })).toBeNull();
    expect(nudge(list, 3, 6, { row: 0, col: 1 })).toBeNull();
  });
});

describe("a widget put in a field", () => {
  it("keeps it; the others fill from the top around it", () => {
    const list: WidgetItem[] = [{ ...small("focus"), at: { row: 0, col: 0 } }, { kind: "free", size: "3x1" }, { ...small("leave"), at: { row: 5, col: 2 } }];
    expect(pack(list).placed.map((p) => [p.index, p.row, p.col])).toEqual([
      [0, 0, 0],
      [1, 1, 0],
      [2, 5, 2],
    ]);
  });

  it("flows like the others when its field is not on this screen", () => {
    const list: WidgetItem[] = [small("focus"), { ...small("leave"), at: { row: 5, col: 2 } }];
    expect(where(list, 1, 4)).toEqual([0, 1]);
  });

  it("stays in its row when it gets wider", () => {
    expect(resized({ kind: "next", size: "3x2", at: { row: 2, col: 0 } }, "3x4").at).toEqual({ row: 2, col: 0 });
    expect(resized({ kind: "weather", size: "3x2" }, "3x4").at).toBeUndefined();
  });

  it("is saved only with a field of the grid", () => {
    expect(checkLayout([{ kind: "focus", size: "1x1", at: { row: 5, col: 2 } }]).ok).toBe(true);
    for (const at of [{ row: 6, col: 0 }, { row: 0, col: 3 }, { row: 1.5, col: 0 }, { row: 0 }, [0, 0], "0,0", { row: 0, col: 0, x: 1 }]) {
      expect(checkLayout([{ kind: "focus", size: "1x1", at }])).toEqual({ ok: false, message: LAYOUT_MESSAGES.badField });
    }
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
