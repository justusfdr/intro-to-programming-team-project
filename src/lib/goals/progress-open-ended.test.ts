// R9 for a goal without an end date (spec 41): the strip runs from the week of creation to the current
// week, at most the latest 12 weeks; the countdown says "No end date"; past weeks are judged as for any
// goal (R8). Dated goals are covered unchanged by progress.test.ts.
import { describe, expect, it } from "vitest";
import { goalProgress, type DoneEvent, type GoalInput, type Rule } from "./progress";

const LISBON = "Europe/Lisbon";
const COUNT_2: Rule = { id: "r1", kind: "count", target: 2, minMinutes: null };
// Monday 16 November 2026, 09:00 UTC (also 09:00 in Lisbon).
const NOW = new Date("2026-11-16T09:00:00Z");

function done(start: string, minutes: number): DoneEvent {
  const startAt = new Date(start);
  return { startAt, endAt: new Date(startAt.getTime() + minutes * 60_000) };
}

function openEnded(fields: Partial<GoalInput>): GoalInput {
  return { createdAt: new Date("2026-11-02T10:00:00Z"), deadline: null, rules: [COUNT_2], doneEvents: [], ...fields };
}

describe("a goal without an end date", () => {
  it("a young goal: the strip runs from the week of creation to this week, the countdown says 'No end date'", () => {
    const progress = goalProgress(
      openEnded({ doneEvents: [done("2026-11-10T09:00:00Z", 30), done("2026-11-12T09:00:00Z", 30)] }),
      NOW,
      LISBON,
    );
    expect(progress.countdown).toBe("No end date");
    expect(progress.weeks).toEqual([
      { monday: "2026-11-02", status: "open", isCurrent: false }, // the creation week is never missed
      { monday: "2026-11-09", status: "met", isCurrent: false },
      { monday: "2026-11-16", status: "open", isCurrent: true },
    ]);
    expect(progress.thisWeek).toEqual([{ ruleId: "r1", text: "This week: 0 of 2 done", status: "open" }]);
  });

  it("a goal created this week has a strip of one week", () => {
    const progress = goalProgress(openEnded({ createdAt: new Date("2026-11-16T08:00:00Z") }), NOW, LISBON);
    expect(progress.weeks).toEqual([{ monday: "2026-11-16", status: "open", isCurrent: true }]);
  });

  it("a goal older than 12 weeks shows only the latest 12, ending with this week; past weeks are judged", () => {
    const progress = goalProgress(openEnded({ createdAt: new Date("2026-05-04T10:00:00Z") }), NOW, LISBON);
    expect(progress.weeks).toHaveLength(12);
    expect(progress.weeks[0]).toEqual({ monday: "2026-08-31", status: "missed", isCurrent: false });
    expect(progress.weeks[10]).toEqual({ monday: "2026-11-09", status: "missed", isCurrent: false });
    expect(progress.weeks[11]).toEqual({ monday: "2026-11-16", status: "open", isCurrent: true });
  });

  it("a goal exactly 12 weeks old still shows its creation week", () => {
    const progress = goalProgress(openEnded({ createdAt: new Date("2026-08-31T10:00:00Z") }), NOW, LISBON);
    expect(progress.weeks.map((w) => w.monday)[0]).toBe("2026-08-31");
    expect(progress.weeks[0].status).toBe("open");
    expect(progress.weeks).toHaveLength(12);
  });

  it("a dated goal keeps its strip to the deadline and its countdown", () => {
    const progress = goalProgress(openEnded({ deadline: "2026-11-29" }), NOW, LISBON);
    expect(progress.countdown).toBe("13 days left");
    expect(progress.weeks.map((w) => w.monday)).toEqual(["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"]);
  });
});
