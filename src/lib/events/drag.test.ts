import { describe, expect, it } from "vitest";
import {
  canDrag,
  clickSpan,
  columnIndexAt,
  createSpan,
  dropTimes,
  exceedsThreshold,
  localAt,
  minuteAtY,
  moveSpan,
  resizeSpan,
  snap,
} from "./drag";
import type { GridRange, Placed } from "./grid";
import type { WeekEvent } from "./types";

// The cases of the first prototype's drag tests, plus what this app adds (what may be dragged, a drop).
const range: GridRange = { startMin: 420, endMin: 1260 }; // 7am to 9pm

describe("snap", () => {
  it("rounds to a quarter of an hour", () => {
    expect(snap(540)).toBe(540);
    expect(snap(537)).toBe(540);
    expect(snap(530)).toBe(525);
  });

  it("rounds to another step", () => {
    expect(snap(547, 30)).toBe(540);
    expect(snap(556, 30)).toBe(570);
  });
});

describe("minuteAtY", () => {
  it("gives the first visible minute at height 0", () => {
    expect(minuteAtY(0, range)).toBe(420);
  });

  it("works out the middle of the grid (not snapped)", () => {
    // 14 hours × 52 px = 728 px; 364 px is the middle: 7am + 7 h = 2pm
    expect(minuteAtY(364, range)).toBe(840);
    expect(minuteAtY(10, range)).toBeCloseTo(431.54, 2);
  });

  it("takes another hour height when given", () => {
    expect(minuteAtY(60, range, 60)).toBe(480);
  });

  it("stays inside the visible hours", () => {
    expect(minuteAtY(-100, range)).toBe(420);
    expect(minuteAtY(10000, range)).toBe(1260);
  });
});

describe("exceedsThreshold", () => {
  it("tells a click from a drag by the distance moved", () => {
    expect(exceedsThreshold(3, 3)).toBe(true); // 4.24 px
    expect(exceedsThreshold(2, 2)).toBe(false); // 2.83 px
  });

  it("exactly the threshold is still a click", () => {
    expect(exceedsThreshold(4, 0)).toBe(false);
    expect(exceedsThreshold(0, 5)).toBe(true);
  });

  it("takes its own threshold", () => {
    expect(exceedsThreshold(10, 0, 10)).toBe(false);
  });
});

describe("createSpan", () => {
  it("dragging down: from the first minute to the current one", () => {
    expect(createSpan(540, 630, range)).toEqual({ startMin: 540, endMin: 630 });
  });

  it("dragging up: start and end swap", () => {
    expect(createSpan(630, 540, range)).toEqual({ startMin: 540, endMin: 630 });
  });

  it("snaps outwards to a quarter of an hour", () => {
    expect(createSpan(547, 612, range)).toEqual({ startMin: 540, endMin: 615 });
  });

  it("a tiny drag gives 15 minutes", () => {
    expect(createSpan(600, 603, range)).toEqual({ startMin: 600, endMin: 615 });
    expect(createSpan(600, 600, range)).toEqual({ startMin: 600, endMin: 615 });
  });

  it("stops at the top of the visible hours", () => {
    expect(createSpan(300, 330, range)).toEqual({ startMin: 420, endMin: 435 });
  });

  it("stops at the bottom and still keeps 15 minutes", () => {
    expect(createSpan(1300, 1350, range)).toEqual({ startMin: 1245, endMin: 1260 });
    expect(createSpan(0, 2000, range)).toEqual({ startMin: 420, endMin: 1260 });
  });
});

describe("clickSpan", () => {
  it("starts at the half hour above and lasts an hour", () => {
    expect(clickSpan(547, range)).toEqual({ startMin: 540, endMin: 600 });
  });

  it("takes its own length", () => {
    expect(clickSpan(547, range, 30)).toEqual({ startMin: 540, endMin: 570 });
  });

  it("starts no earlier than the first visible hour", () => {
    expect(clickSpan(400, range)).toEqual({ startMin: 420, endMin: 480 });
  });

  it("starts at least half an hour before the last visible hour", () => {
    expect(clickSpan(1255, range)).toEqual({ startMin: 1230, endMin: 1290 });
  });

  it("ends at midnight at the latest", () => {
    expect(clickSpan(1420, { startMin: 0, endMin: 1440 })).toEqual({ startMin: 1410, endMin: 1440 });
  });
});

describe("moveSpan", () => {
  const span = { startMin: 540, endMin: 600 };

  it("moves down and snaps the start", () => {
    expect(moveSpan(span, 30)).toEqual({ startMin: 570, endMin: 630 });
    expect(moveSpan(span, -20)).toEqual({ startMin: 525, endMin: 585 });
  });

  it("moves up and keeps the length", () => {
    expect(moveSpan(span, -100)).toEqual({ startMin: 435, endMin: 495 });
  });

  it("stops at midnight at the top", () => {
    expect(moveSpan({ startMin: 30, endMin: 90 }, -500)).toEqual({ startMin: 0, endMin: 60 });
  });

  it("stops so that the end is midnight at the bottom (never past the day)", () => {
    expect(moveSpan({ startMin: 1350, endMin: 1410 }, 500)).toEqual({ startMin: 1380, endMin: 1440 });
  });
});

describe("resizeSpan", () => {
  const span = { startMin: 540, endMin: 600 };

  it("snaps the new end and keeps the start", () => {
    expect(resizeSpan(span, 652)).toEqual({ startMin: 540, endMin: 645 });
  });

  it("keeps the end after the start, at least 15 minutes", () => {
    expect(resizeSpan(span, 550)).toEqual({ startMin: 540, endMin: 555 });
    expect(resizeSpan(span, 500)).toEqual({ startMin: 540, endMin: 555 });
  });

  it("ends at midnight at the latest, so an event never lasts more than 24 hours", () => {
    expect(resizeSpan(span, 1500)).toEqual({ startMin: 540, endMin: 1440 });
    expect(resizeSpan({ startMin: 0, endMin: 60 }, 3000)).toEqual({ startMin: 0, endMin: 1440 });
  });
});

describe("columnIndexAt", () => {
  const columns = [
    { left: 0, right: 100 },
    { left: 100, right: 200 },
    { left: 250, right: 350 },
  ];

  it("finds the column under x", () => {
    expect(columnIndexAt(50, columns)).toBe(0);
    expect(columnIndexAt(150, columns)).toBe(1);
    expect(columnIndexAt(300, columns)).toBe(2);
  });

  it("left of all columns is the first", () => {
    expect(columnIndexAt(-10, columns)).toBe(0);
  });

  it("right of all columns is the last", () => {
    expect(columnIndexAt(400, columns)).toBe(2);
  });

  it("in a gap the nearest middle wins", () => {
    expect(columnIndexAt(210, columns)).toBe(1);
    expect(columnIndexAt(230, columns)).toBe(2);
  });

  it("without columns it is -1", () => {
    expect(columnIndexAt(10, [])).toBe(-1);
  });
});

describe("localAt", () => {
  it("turns minutes into a local time", () => {
    expect(localAt("2026-11-06", 540)).toBe("2026-11-06T09:00");
    expect(localAt("2026-11-06", 0)).toBe("2026-11-06T00:00");
  });

  it("1440 is 00:00 of the next day", () => {
    expect(localAt("2026-11-06", 1440)).toBe("2026-11-07T00:00");
    expect(localAt("2026-11-06", 1500)).toBe("2026-11-07T01:00");
  });

  it("negative minutes are on the day before", () => {
    expect(localAt("2026-11-06", -60)).toBe("2026-11-05T23:00");
  });

  it("is a wall-clock time, also on the day the clocks change", () => {
    expect(localAt("2026-03-29", 600)).toBe("2026-03-29T10:00");
  });
});

function block(over: Partial<Placed> = {}, event: Partial<WeekEvent> = {}): Placed {
  return {
    event: {
      id: "e1",
      title: "Study",
      allDay: false,
      startAt: "",
      endAt: "",
      firstDay: null,
      lastDay: null,
      mayOverlap: false,
      status: "planned",
      goalId: null,
      seriesId: null,
      source: "app",
      location: null,
      notSent: false,
      updatedAt: "",
      conflict: false,
      startTime: "09:00",
      endTime: "10:00",
      endDay: null,
      startLocal: "2026-11-17T09:00",
      endLocal: "2026-11-17T10:00",
      ...event,
    },
    startMin: 540,
    endMin: 600,
    continuesBefore: false,
    continuesAfter: false,
    lane: 0,
    lanes: 1,
    ...over,
  };
}

describe("what can be dragged", () => {
  const none = new Set<string>();

  it("an app or assistant event can be dragged, also a done one or one of a series", () => {
    expect(canDrag(block(), none)).toBe(true);
    expect(canDrag(block({}, { source: "assistant" }), none)).toBe(true);
    expect(canDrag(block({}, { status: "done" }), none)).toBe(true);
    expect(canDrag(block({}, { seriesId: "s1" }), none)).toBe(true);
  });

  it("an Outlook event cannot be dragged (R11)", () => {
    expect(canDrag(block({}, { source: "outlook" }), none)).toBe(false);
  });

  it("neither part of an event past midnight can be dragged", () => {
    expect(canDrag(block({ continuesAfter: true }), none)).toBe(false);
    expect(canDrag(block({ continuesBefore: true }), none)).toBe(false);
  });

  it("an event that ends exactly at midnight is one whole block and can be dragged", () => {
    expect(canDrag(block({ continuesAfter: true, endMin: 1440 }, { endDay: "2026-11-18", endLocal: "2026-11-18T00:00" }), none)).toBe(true);
  });

  it("an event whose save is still running cannot be dragged", () => {
    expect(canDrag(block(), new Set(["e1"]))).toBe(false);
    expect(canDrag(block(), new Set(["other"]))).toBe(true);
  });
});

describe("a drop", () => {
  const event = { startLocal: "2026-11-17T09:00", endLocal: "2026-11-17T10:00" };

  it("gives the new local start and end", () => {
    expect(dropTimes(event, "2026-11-17", { startMin: 600, endMin: 660 })).toEqual({ start: "2026-11-17T10:00", end: "2026-11-17T11:00" });
  });

  it("to another day keeps the times", () => {
    expect(dropTimes(event, "2026-11-19", { startMin: 540, endMin: 600 })).toEqual({ start: "2026-11-19T09:00", end: "2026-11-19T10:00" });
  });

  it("a resize to midnight ends at 00:00 of the next day", () => {
    expect(dropTimes(event, "2026-11-17", { startMin: 540, endMin: 1440 })).toEqual({ start: "2026-11-17T09:00", end: "2026-11-18T00:00" });
  });

  it("back on the same place changes nothing", () => {
    expect(dropTimes(event, "2026-11-17", { startMin: 540, endMin: 600 })).toBeNull();
  });
});
