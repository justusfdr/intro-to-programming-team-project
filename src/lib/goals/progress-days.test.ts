// R9 (changed 17 Nov 2026): the 7 days of this week, Monday to Sunday, each done when a done event
// of the goal starts on it. A day is never judged as missed.
import { describe, expect, it } from "vitest";
import { goalProgress, thisWeekDays } from "./progress";

const TZ = "Europe/Lisbon";
// Thursday 19 Nov 2026, 15:00 in Lisbon.
const NOW = new Date("2026-11-19T15:00:00Z");
const event = (start: string, minutes = 60) => ({ startAt: new Date(start), endAt: new Date(new Date(start).getTime() + minutes * 60_000) });

describe("this week's days", () => {
  it("runs from Monday to Sunday of the current week and marks today", () => {
    const days = thisWeekDays([], NOW, TZ);
    expect(days.map((d) => d.date)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    expect(days.filter((d) => d.isToday).map((d) => d.date)).toEqual(["2026-11-19"]);
    expect(days.every((d) => !d.done)).toBe(true);
  });

  it("marks the days on which a done event starts, twice on one day still one day", () => {
    const days = thisWeekDays([event("2026-11-16T18:00:00Z"), event("2026-11-18T07:00:00Z"), event("2026-11-18T19:00:00Z")], NOW, TZ);
    expect(days.filter((d) => d.done).map((d) => d.date)).toEqual(["2026-11-16", "2026-11-18"]);
  });

  it("counts the day in the user's time zone", () => {
    // 23:30 UTC on Tuesday is 08:30 on Wednesday in Tokyo.
    const days = thisWeekDays([event("2026-11-17T23:30:00Z")], NOW, "Asia/Tokyo");
    expect(days.filter((d) => d.done).map((d) => d.date)).toEqual(["2026-11-18"]);
  });

  it("leaves out events of other weeks", () => {
    const days = thisWeekDays([event("2026-11-13T10:00:00Z"), event("2026-11-23T10:00:00Z")], NOW, TZ);
    expect(days.some((d) => d.done)).toBe(false);
  });

  it("is part of every goal's progress", () => {
    const progress = goalProgress(
      { createdAt: new Date("2026-11-01T10:00:00Z"), deadline: null, rules: [{ id: "r1", kind: "count", target: 4, minMinutes: null }], doneEvents: [event("2026-11-17T08:00:00Z")] },
      NOW,
      TZ,
    );
    expect(progress.days?.filter((d) => d.done).map((d) => d.date)).toEqual(["2026-11-17"]);
  });
});
