// Spec 45: the grid (pack, R46's check), the leave levels and the weather words, shared by browser and server.
import { describe, expect, it } from "vitest";
import { checkLayout, fitsWith, LAYOUT_MESSAGES, pack, rowsFor } from "./layout";
import { durationText, leaveLevel, leaveLine, minutesUntil } from "./leave";
import { DEFAULT_LAYOUT, type WidgetItem } from "./types";
import { roundCoordinate, skyLabel, skyOf } from "./weather";

const GOAL = "2f1b4c1e-7a51-4c1e-9a2b-3c4d5e6f7a8b";

describe("pack: where the widgets sit", () => {
  it("fills the standard list into exactly the 3 × 6 grid", () => {
    const { placed, hidden } = pack(DEFAULT_LAYOUT);
    expect(hidden).toEqual([]);
    expect(placed.map((p) => [p.row, p.col, p.w, p.h])).toEqual([
      [0, 0, 3, 2],
      [2, 0, 3, 2],
      [4, 0, 1, 1],
      [4, 1, 1, 1],
      [4, 2, 1, 1],
      [5, 0, 3, 1],
    ]);
  });

  it("lets a small widget after a wide one fill the hole beside an earlier small one", () => {
    const list: WidgetItem[] = [
      { kind: "focus", size: "1x1" },
      { kind: "weather", size: "3x2" },
      { kind: "leave", size: "1x1" },
    ];
    expect(pack(list).placed.map((p) => [p.index, p.row, p.col])).toEqual([
      [0, 0, 0],
      [1, 1, 0],
      [2, 0, 1],
    ]);
  });

  it("leaves out what does not fit in fewer rows (a short window)", () => {
    const { placed, hidden } = pack(DEFAULT_LAYOUT, 4);
    expect(placed.map((p) => p.index)).toEqual([0, 1]);
    expect(hidden).toEqual([2, 3, 4, 5]);
  });

  it("knows whether one more widget still fits", () => {
    expect(fitsWith(DEFAULT_LAYOUT, { kind: "focus", size: "1x1" })).toBe(false);
    expect(fitsWith(DEFAULT_LAYOUT.slice(0, 5), { kind: "free", size: "3x1" })).toBe(true);
    expect(fitsWith(DEFAULT_LAYOUT.slice(0, 5), { kind: "next", size: "3x4" })).toBe(false);
  });

  it("counts the rows that fit in a height: 64 px fields, 8 px apart, at most 6", () => {
    expect(rowsFor(63)).toBe(0);
    expect(rowsFor(64)).toBe(1);
    expect(rowsFor(135)).toBe(1);
    expect(rowsFor(136)).toBe(2);
    expect(rowsFor(424)).toBe(6);
    expect(rowsFor(2000)).toBe(6);
  });
});

describe("R46: which widget lists may be saved", () => {
  it("accepts a full grid, the empty list and a goal widget with or without a goal", () => {
    expect(checkLayout(DEFAULT_LAYOUT)).toEqual({ ok: true, layout: DEFAULT_LAYOUT });
    expect(checkLayout([])).toEqual({ ok: true, layout: [] });
    const goals = [
      { kind: "goal", size: "1x1", goalId: GOAL },
      { kind: "goal", size: "1x1" },
    ];
    expect(checkLayout(goals)).toEqual({
      ok: true,
      layout: [
        { kind: "goal", size: "1x1", goalId: GOAL },
        { kind: "goal", size: "1x1", goalId: null },
      ],
    });
  });

  it("refuses a 19th field", () => {
    expect(checkLayout([...DEFAULT_LAYOUT, { kind: "focus", size: "1x1" }])).toEqual({ ok: false, message: LAYOUT_MESSAGES.tooMany });
    expect(checkLayout(Array(19).fill({ kind: "focus", size: "1x1" }))).toEqual({ ok: false, message: LAYOUT_MESSAGES.tooMany });
  });

  it("refuses a size the widget does not come in", () => {
    expect(checkLayout([{ kind: "weather", size: "3x4" }])).toEqual({ ok: false, message: LAYOUT_MESSAGES.wrongSize });
    expect(checkLayout([{ kind: "goal", size: "2x2" }])).toEqual({ ok: false, message: LAYOUT_MESSAGES.wrongSize });
  });

  it("refuses an unknown kind, a goal on another widget, a bad goal id and extra fields", () => {
    expect(checkLayout([{ kind: "clock", size: "1x1" }])).toEqual({ ok: false, message: LAYOUT_MESSAGES.unknownKind });
    expect(checkLayout([{ kind: "weather", size: "3x2", goalId: GOAL }])).toEqual({ ok: false, message: LAYOUT_MESSAGES.badGoal });
    expect(checkLayout([{ kind: "goal", size: "1x1", goalId: "1; drop table" }])).toEqual({ ok: false, message: LAYOUT_MESSAGES.badGoal });
    expect(checkLayout([{ kind: "focus", size: "1x1", color: "red" }])).toEqual({ ok: false, message: LAYOUT_MESSAGES.notAList });
    expect(checkLayout({ kind: "focus" })).toEqual({ ok: false, message: LAYOUT_MESSAGES.notAList });
    expect(checkLayout([null])).toEqual({ ok: false, message: LAYOUT_MESSAGES.notAList });
  });
});

describe("leave levels", () => {
  it("colours by the minutes left: green, amber from 30, orange from 20, red from 10, now at 0, then late", () => {
    expect([45, 31, 30, 21, 20, 11, 10, 1, 0, -1, -15].map(leaveLevel)).toEqual([
      "green",
      "green",
      "amber",
      "amber",
      "orange",
      "orange",
      "red",
      "red",
      "now",
      "late",
      "late",
    ]);
  });

  it("rounds the minutes up, so 9 minutes 10 seconds is still 10 minutes", () => {
    const now = new Date("2026-11-17T13:00:00Z");
    expect(minutesUntil(new Date("2026-11-17T13:09:10Z"), now)).toBe(10);
    expect(minutesUntil(new Date("2026-11-17T13:00:00Z"), now)).toBe(0);
    expect(minutesUntil(new Date("2026-11-17T12:59:30Z"), now)).toBe(0);
    expect(minutesUntil(new Date("2026-11-17T12:58:00Z"), now)).toBe(-2);
  });

  it("says it in words", () => {
    expect(leaveLine(12)).toBe("Leave in 12 min");
    expect(leaveLine(65)).toBe("Leave in 1 h 5 min");
    expect(leaveLine(0)).toBe("Leave now");
    expect(leaveLine(-4)).toBe("4 min late");
    expect(durationText(120)).toBe("2 h");
  });
});

describe("weather words", () => {
  it("turns WMO codes into a sky", () => {
    expect([0, 1, 2, 3, 45, 51, 61, 81, 71, 86, 95, 99].map(skyOf)).toEqual([
      "clear",
      "clear",
      "partly",
      "cloudy",
      "fog",
      "drizzle",
      "rain",
      "rain",
      "snow",
      "snow",
      "storm",
      "storm",
    ]);
  });

  it("says Sunny by day and Clear by night", () => {
    expect(skyLabel("clear", true)).toBe("Sunny");
    expect(skyLabel("clear", false)).toBe("Clear");
    expect(skyLabel("storm", true)).toBe("Thunderstorm");
  });

  it("rounds coordinates to two decimals (about 1 km) before they leave the server (R47)", () => {
    expect(roundCoordinate(38.678912)).toBe(38.68);
    expect(roundCoordinate(-9.334567)).toBe(-9.33);
  });
});
