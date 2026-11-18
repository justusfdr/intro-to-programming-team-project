// Tests for the Analytics layout (spec 49, "Edit widgets"): which widgets a tab may show, when a tab is
// full, and that a layout from outside is refused as a whole unless everything in it is allowed.
import { describe, expect, it } from "vitest";
import { GRID_ROWS, STANDARD_LAYOUT, TABS, WIDGET_KINDS, type WidgetItem } from "./report-types";
import { allowedOn, checkLayout, fits, LAYOUT_MESSAGES, layoutOf, rowsNeeded, sizesOf, standardLayout, widgetsFor } from "./layout";

const withTab = (tab: string, items: unknown) => ({ ...standardLayout(), [tab]: items });

describe("the standard layout", () => {
  it("passes its own check and fills every tab without a third row", () => {
    expect(checkLayout(STANDARD_LAYOUT)).toEqual({ ok: true, layout: STANDARD_LAYOUT });
    for (const tab of TABS) expect(rowsNeeded(STANDARD_LAYOUT[tab])).toBeLessThanOrEqual(GRID_ROWS);
  });

  it("is copied, so changing the copy leaves the standard one alone", () => {
    const copy = standardLayout();
    copy.focus.pop();
    copy.goals[0].size = "L";
    expect(copy.focus.length).toBe(STANDARD_LAYOUT.focus.length - 1);
    expect(STANDARD_LAYOUT.goals[0].size).toBe("M");
  });
});

describe("which widgets a tab may show", () => {
  it("lets the Overview show every widget", () => {
    expect(widgetsFor("overview")).toEqual(WIDGET_KINDS);
  });

  it("keeps the other tabs to their own topic", () => {
    expect(allowedOn("focus", "focus_time")).toBe(true);
    expect(allowedOn("focus", "top_sites")).toBe(false);
    expect(allowedOn("blocked", "top_sites")).toBe(true);
    expect(allowedOn("goals", "week_in_short")).toBe(false);
  });

  it("also lets the Streaks tab show the weeks in a row per goal", () => {
    expect(allowedOn("streaks", "goal_streaks")).toBe(true);
    expect(allowedOn("time", "goal_streaks")).toBe(false);
  });

  it("gives every widget at least one size, the first being its standard one", () => {
    for (const kind of WIDGET_KINDS) expect(sizesOf(kind).length).toBeGreaterThan(0);
    expect(sizesOf("plan")[0]).toBe("L");
  });
});

describe("whether a tab is full", () => {
  const S: WidgetItem = { kind: "focus_score", size: "S" };
  const M: WidgetItem = { kind: "focus_time", size: "M" };
  const L: WidgetItem = { kind: "weeks", size: "L" };

  it("fits 8 small widgets, 4 medium ones, or 2 large with 2 small", () => {
    expect(fits(Array(8).fill(S))).toBe(true);
    expect(fits(Array(4).fill(M))).toBe(true);
    expect(fits([L, S, L, S])).toBe(true);
  });

  it("does not fit a ninth field", () => {
    expect(fits(Array(9).fill(S))).toBe(false);
    expect(fits([M, M, M, M, S])).toBe(false);
  });

  it("does not fit 8 fields that cannot share two rows: large, medium, large", () => {
    expect(rowsNeeded([L, M, L])).toBe(3);
    expect(fits([L, M, L])).toBe(false);
  });

  it("fills a hole in an earlier row with a later small widget", () => {
    // Large leaves one field in row 1; the medium one starts row 2; the small one goes back up.
    expect(rowsNeeded([L, M, S, M])).toBe(2);
  });

  it("needs no row for an empty tab", () => {
    expect(rowsNeeded([])).toBe(0);
    expect(fits([])).toBe(true);
  });
});

describe("a layout from outside", () => {
  it("is accepted when every tab is allowed, also with an empty tab", () => {
    const layout = withTab("time", []);
    expect(checkLayout(layout)).toEqual({ ok: true, layout });
  });

  it("is refused when it is not one list per tab", () => {
    const { focus: _focus, ...missing } = standardLayout();
    for (const bad of [null, "x", [], 7, missing, { ...standardLayout(), extra: [] }, withTab("goals", "nothing")]) {
      expect(checkLayout(bad)).toEqual({ ok: false, message: LAYOUT_MESSAGES.notALayout });
    }
  });

  it("is refused for a widget that does not exist, or an entry with other fields", () => {
    for (const bad of [{ kind: "weather", size: "S" }, { kind: "toString", size: "S" }, "focus_time", { kind: "focus_time" }, { kind: "focus_time", size: "M", goalId: "x" }]) {
      expect(checkLayout(withTab("focus", [bad]))).toEqual({ ok: false, message: LAYOUT_MESSAGES.unknownKind });
    }
  });

  it("is refused for a widget on a tab it does not belong to", () => {
    expect(checkLayout(withTab("focus", [{ kind: "top_sites", size: "M" }]))).toEqual({ ok: false, message: LAYOUT_MESSAGES.wrongTab });
  });

  it("is refused for a size the widget does not come in", () => {
    for (const size of ["L", "XL", 2, null]) {
      expect(checkLayout(withTab("focus", [{ kind: "focus_score", size }]))).toEqual({ ok: false, message: LAYOUT_MESSAGES.wrongSize });
    }
  });

  it("is refused for the same widget twice on one tab, but not on two tabs", () => {
    const twice = [{ kind: "focus_time", size: "M" }, { kind: "focus_time", size: "L" }];
    expect(checkLayout(withTab("focus", twice))).toEqual({ ok: false, message: LAYOUT_MESSAGES.twice });
    expect(checkLayout(standardLayout()).ok).toBe(true); // focus_time is on Overview and on Focus
  });

  it("is refused when one tab does not fit", () => {
    const tooMany = [{ kind: "time_by_day", size: "L" }, { kind: "plan_kept", size: "M" }, { kind: "top_areas", size: "M" }, { kind: "busiest_day", size: "S" }, { kind: "time_on_goals", size: "S" }];
    expect(checkLayout(withTab("time", tooMany))).toEqual({ ok: false, message: LAYOUT_MESSAGES.noRoom });
  });
});

describe("the layout to show", () => {
  it("is the standard one when nothing is saved", () => {
    expect(layoutOf(null)).toEqual({ layout: STANDARD_LAYOUT, isStandard: true });
    expect(layoutOf(undefined).isStandard).toBe(true);
  });

  it("is the saved one when it still passes", () => {
    const saved = withTab("blocked", [{ kind: "top_sites", size: "M" }]);
    expect(layoutOf(saved)).toEqual({ layout: saved, isStandard: false });
  });

  it("falls back to the standard one for a saved value that no longer passes", () => {
    expect(layoutOf(withTab("focus", [{ kind: "gone", size: "S" }]))).toEqual({ layout: STANDARD_LAYOUT, isStandard: true });
  });
});
