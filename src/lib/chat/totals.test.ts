// Tests for R31's totals (spec 19): per week and goal, done minutes and focused minutes; sessions count
// for their event's goal, else "no goal"; done events without a goal per title, top 20; 8 weeks only.
import { describe, expect, it } from "vitest";
import { chatTotals, NO_GOAL, totalsWindow } from "./totals";

const TZ = "Europe/Lisbon";
// Monday 16 November 2026, 09:00 (current week: 16 to 22 Nov; the oldest week counted: 28 Sep).
const NOW = new Date("2026-11-16T09:00:00Z");
const RUN = { id: "goal-run", title: "Half marathon" };
const STATS = { id: "goal-stats", title: "Statistics exam" };

const done = (start: string, minutes: number, goalId: string | null, title = "Run") => ({
  title,
  goalId,
  startAt: new Date(start),
  endAt: new Date(Date.parse(start) + minutes * 60000),
});

describe("chatTotals", () => {
  it("A11: 'Half marathon' 150 minutes last week and 100 the week before", () => {
    const totals = chatTotals(
      {
        doneEvents: [
          done("2026-11-09T07:00:00Z", 90, RUN.id),
          done("2026-11-12T07:00:00Z", 60, RUN.id),
          done("2026-11-03T07:00:00Z", 100, RUN.id),
        ],
        sessions: [],
        goals: [RUN],
      },
      NOW,
      TZ,
    );
    expect(totals.weeks.map((w) => w.monday)).toEqual([
      "2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16",
    ]);
    const week = (monday: string) => totals.weeks.find((w) => w.monday === monday)!.goals;
    expect(week("2026-11-09")).toEqual([{ goalId: RUN.id, goal: "Half marathon", doneMinutes: 150, focusedMinutes: 0 }]);
    expect(week("2026-11-02")).toEqual([{ goalId: RUN.id, goal: "Half marathon", doneMinutes: 100, focusedMinutes: 0 }]);
    expect(week("2026-11-16")).toEqual([]);
    expect(totals.noGoalTitles).toEqual([]);
  });

  it("adds focused minutes: a session counts for its event's goal, else for 'no goal'", () => {
    const totals = chatTotals(
      {
        doneEvents: [],
        sessions: [
          { startedAt: new Date("2026-11-16T08:00:00Z"), focusedMinutes: 45, goalId: STATS.id },
          { startedAt: new Date("2026-11-16T08:30:00Z"), focusedMinutes: 15, goalId: null },
        ],
        goals: [RUN, STATS],
      },
      NOW,
      TZ,
    );
    expect(totals.weeks[7].goals).toEqual([
      { goalId: STATS.id, goal: "Statistics exam", doneMinutes: 0, focusedMinutes: 45 },
      { goalId: null, goal: NO_GOAL, doneMinutes: 0, focusedMinutes: 15 },
    ]);
  });

  it("leaves out everything older than 8 weeks or after this week, and puts an event in the week it starts (R2)", () => {
    const totals = chatTotals(
      {
        doneEvents: [
          done("2026-09-27T22:00:00Z", 60, RUN.id), // Sunday 27 Sep: one week too old
          done("2026-11-23T00:00:00Z", 60, RUN.id), // next Monday
          done("2026-11-15T23:30:00Z", 60, RUN.id), // Sunday 23:30 into Monday: belongs to last week
        ],
        sessions: [{ startedAt: new Date("2026-09-20T10:00:00Z"), focusedMinutes: 30, goalId: null }],
        goals: [RUN],
      },
      NOW,
      TZ,
    );
    const all = totals.weeks.flatMap((w) => w.goals.map((g) => ({ monday: w.monday, ...g })));
    expect(all).toEqual([{ monday: "2026-11-09", goalId: RUN.id, goal: "Half marathon", doneMinutes: 60, focusedMinutes: 0 }]);
  });

  it("lists done events without a goal per title, only the 20 with the most minutes, most first", () => {
    const doneEvents = Array.from({ length: 22 }, (_, i) => done("2026-11-10T08:00:00Z", 10 + i, null, `Title ${i}`));
    doneEvents.push(done("2026-11-03T08:00:00Z", 100, null, "Title 0"));
    const totals = chatTotals({ doneEvents, sessions: [], goals: [] }, NOW, TZ);
    expect(totals.noGoalTitles).toHaveLength(20);
    expect(totals.noGoalTitles[0]).toEqual({
      title: "Title 0",
      minutes: 110,
      weeks: [
        { monday: "2026-11-02", minutes: 100 },
        { monday: "2026-11-09", minutes: 10 },
      ],
    });
    expect(totals.noGoalTitles.map((t) => t.title)).not.toContain("Title 1");
    expect(totals.noGoalTitles.map((t) => t.title)).not.toContain("Title 2");
    // They also count in the week's "no goal" row.
    expect(totals.weeks[6].goals).toEqual([{ goalId: null, goal: NO_GOAL, doneMinutes: [...Array(22).keys()].reduce((s, i) => s + 10 + i, 0), focusedMinutes: 0 }]);
  });

  it("counts an event whose goal was deleted as 'no goal'", () => {
    const totals = chatTotals({ doneEvents: [done("2026-11-10T08:00:00Z", 30, "gone", "Old")], sessions: [], goals: [] }, NOW, TZ);
    expect(totals.weeks[6].goals).toEqual([{ goalId: null, goal: NO_GOAL, doneMinutes: 30, focusedMinutes: 0 }]);
    expect(totals.noGoalTitles.map((t) => t.title)).toEqual(["Old"]);
  });

  it("totalsWindow: Monday 00:00 seven weeks back to next Monday 00:00 in the user's time zone", () => {
    expect(totalsWindow(NOW, TZ)).toEqual({ from: new Date("2026-09-28T00:00:00+01:00"), until: new Date("2026-11-23T00:00:00Z") });
  });
});
