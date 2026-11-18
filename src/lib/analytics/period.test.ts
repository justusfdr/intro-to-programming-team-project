// Tests for a report over several weeks (spec 49, "Export"): which periods and parts may be asked for,
// and the numbers a report adds up, with fixed dates.
import { describe, expect, it } from "vitest";
import { checkPeriod, lastDayOf, PARTS, PERIOD_MESSAGES, presetPeriod } from "./period";
import { buildPeriod, type PeriodInput } from "./period-build";
import type { ReportEvent, ReportGoal, ReportSession } from "./report";

const TODAY = "2026-11-18"; // a Wednesday; its week starts on Monday 16 November

describe("what an export may ask for", () => {
  const all = PARTS.join(",");

  it("accepts whole weeks up to the current one, any day standing for its week", () => {
    expect(checkPeriod({ from: "2026-10-19", to: "2026-11-09", parts: all }, TODAY)).toEqual({
      ok: true,
      period: { from: "2026-10-19", to: "2026-11-09", weeks: 4 },
      parts: [...PARTS],
    });
    expect(checkPeriod({ from: "2026-11-18", to: "2026-11-20", parts: "goals" }, TODAY)).toEqual({
      ok: true,
      period: { from: "2026-11-16", to: "2026-11-16", weeks: 1 },
      parts: ["goals"],
    });
  });

  it("puts the parts in printing order, each once, from a text or a list", () => {
    const text = checkPeriod({ from: "2026-11-09", to: "2026-11-09", parts: "blocked,summary,blocked" }, TODAY);
    expect(text.ok && text.parts).toEqual(["summary", "blocked"]);
    const list = checkPeriod({ from: "2026-11-09", to: "2026-11-09", parts: ["trends", "goals"] }, TODAY);
    expect(list.ok && list.parts).toEqual(["goals", "trends"]);
  });

  it("accepts exactly 26 weeks and refuses 27", () => {
    expect(checkPeriod({ from: "2026-05-25", to: "2026-11-16", parts: all }, TODAY).ok).toBe(true);
    expect(checkPeriod({ from: "2026-05-18", to: "2026-11-16", parts: all }, TODAY)).toEqual({ ok: false, message: PERIOD_MESSAGES.tooLong });
  });

  it("refuses a week that has not started", () => {
    expect(checkPeriod({ from: "2026-11-16", to: "2026-11-23", parts: all }, TODAY)).toEqual({ ok: false, message: PERIOD_MESSAGES.future });
  });

  it("refuses a first week after the last week", () => {
    expect(checkPeriod({ from: "2026-11-09", to: "2026-11-02", parts: all }, TODAY)).toEqual({ ok: false, message: PERIOD_MESSAGES.wrongOrder });
  });

  it("refuses dates that are missing or not dates", () => {
    for (const bad of [null, undefined, "", "2026-13-01", "16.11.2026", 20261116]) {
      expect(checkPeriod({ from: bad, to: "2026-11-09", parts: all }, TODAY)).toEqual({ ok: false, message: PERIOD_MESSAGES.badWeek });
      expect(checkPeriod({ from: "2026-11-09", to: bad, parts: all }, TODAY)).toEqual({ ok: false, message: PERIOD_MESSAGES.badWeek });
    }
  });

  it("refuses no parts, and parts that do not exist", () => {
    expect(checkPeriod({ from: "2026-11-09", to: "2026-11-09", parts: "" }, TODAY)).toEqual({ ok: false, message: PERIOD_MESSAGES.noParts });
    expect(checkPeriod({ from: "2026-11-09", to: "2026-11-09", parts: [] }, TODAY)).toEqual({ ok: false, message: PERIOD_MESSAGES.noParts });
    expect(checkPeriod({ from: "2026-11-09", to: "2026-11-09", parts: null }, TODAY)).toEqual({ ok: false, message: PERIOD_MESSAGES.noParts });
    expect(checkPeriod({ from: "2026-11-09", to: "2026-11-09", parts: "summary,travel" }, TODAY)).toEqual({ ok: false, message: PERIOD_MESSAGES.badPart });
  });

  it("offers periods of whole weeks that are over", () => {
    expect(presetPeriod(1, TODAY)).toEqual({ from: "2026-11-09", to: "2026-11-09", weeks: 1 });
    expect(presetPeriod(4, TODAY)).toEqual({ from: "2026-10-19", to: "2026-11-09", weeks: 4 });
    expect(presetPeriod(8, TODAY)).toEqual({ from: "2026-09-21", to: "2026-11-09", weeks: 8 });
    expect(lastDayOf(presetPeriod(4, TODAY))).toBe("2026-11-15");
  });
});

// ---- The numbers ----

const at = (iso: string) => new Date(iso);
const session = (start: string, end: string, planned: number, focused: number, goal: string | null = null): ReportSession => ({
  startedAt: at(start),
  endedAt: at(end),
  plannedMinutes: planned,
  focusedMinutes: focused,
  goalId: goal ? "g1" : null,
  goalTitle: goal,
});
const event = (id: string, goalId: string | null, start: string, end: string, status: "planned" | "done" = "done"): ReportEvent => ({
  id,
  title: id,
  goalId,
  startAt: at(start),
  endAt: at(end),
  status,
});
const thesis: ReportGoal = {
  id: "g1",
  title: "Thesis",
  color: "indigo",
  icon: "graduation",
  deadline: null,
  createdAt: at("2026-10-01T08:00:00Z"),
  rules: [{ id: "r1", kind: "count", target: 2, minMinutes: null }],
};

/** Two weeks, 2 to 15 November 2026 (W45 and W46), seen on Wednesday 18 November in Lisbon (UTC in November). */
function twoWeeks(): PeriodInput {
  return {
    sessions: [
      session("2026-10-20T10:00:00Z", "2026-10-20T10:30:00Z", 30, 30), // before the period
      session("2026-11-02T09:00:00Z", "2026-11-02T10:00:00Z", 60, 60, "Thesis"),
      session("2026-11-03T17:00:00Z", "2026-11-03T17:30:00Z", 30, 15),
      session("2026-11-09T09:30:00Z", "2026-11-09T10:30:00Z", 60, 60),
      session("2026-11-11T09:00:00Z", "2026-11-11T10:30:00Z", 90, 90, "Thesis"),
      session("2026-11-11T16:00:00Z", "2026-11-11T16:30:00Z", 30, 30),
    ],
    attempts: [
      { domain: "instagram.com", attemptedAt: at("2026-10-21T12:00:00Z") }, // before the period
      { domain: "youtube.com", attemptedAt: at("2026-11-04T12:00:00Z") }, // outside any session
      { domain: "instagram.com", attemptedAt: at("2026-11-09T09:45:00Z") }, // during the third session
    ],
    events: [
      event("e1", "g1", "2026-11-03T10:00:00Z", "2026-11-03T11:30:00Z"),
      event("e2", "g1", "2026-11-05T10:00:00Z", "2026-11-05T11:00:00Z"),
      event("e3", "g1", "2026-11-09T10:00:00Z", "2026-11-09T11:30:00Z"),
      event("Gym", null, "2026-11-11T18:00:00Z", "2026-11-11T19:00:00Z"),
      event("Old", "deleted-goal", "2026-11-12T09:00:00Z", "2026-11-12T09:30:00Z"),
      event("e6", "g1", "2026-11-13T10:00:00Z", "2026-11-13T11:00:00Z", "planned"),
    ],
    goals: [thesis],
    now: at("2026-11-18T12:00:00Z"),
    timeZone: "Europe/Lisbon",
    period: { from: "2026-11-02", to: "2026-11-09", weeks: 2 },
  };
}

describe("the numbers of a report", () => {
  it("adds up each week", () => {
    const report = buildPeriod(twoWeeks());
    expect(report.weeks).toEqual([
      { monday: "2026-11-02", focusedMinutes: 75, sessions: 2, averageSessionMinutes: 38, score: 75, attempts: 1, doneMinutes: 150, goalsReached: 1, goalsJudged: 1 },
      { monday: "2026-11-09", focusedMinutes: 180, sessions: 3, averageSessionMinutes: 60, score: 98, attempts: 1, doneMinutes: 180, goalsReached: 0, goalsJudged: 1 },
    ]);
  });

  it("adds up the period and the same number of weeks before it", () => {
    const report = buildPeriod(twoWeeks());
    expect(report.empty).toBe(false);
    expect(report.createdOn).toBe("2026-11-18");
    expect(report.totals).toEqual({ focusedMinutes: 255, sessions: 5, averageSessionMinutes: 51, score: 89, attempts: 2, doneMinutes: 330, goalMinutes: 240, activeDays: 4, days: 14 });
    expect(report.before).toEqual({ focusedMinutes: 30, attempts: 1 });
  });

  it("judges each goal week by week, as the page does", () => {
    const report = buildPeriod(twoWeeks());
    expect(report.goals).toEqual([
      {
        goal: { id: "g1", title: "Thesis", color: "indigo", icon: "graduation" },
        weeks: [
          { monday: "2026-11-02", text: "2 of 2", status: "met" },
          { monday: "2026-11-09", text: "1 of 2", status: "missed" },
        ],
        metWeeks: 1,
        judgedWeeks: 2,
      },
    ]);
    expect([report.goalWeeksMet, report.goalWeeksJudged]).toEqual([1, 2]);
  });

  it("sorts where the time went, with a deleted goal's events under no goal", () => {
    const report = buildPeriod(twoWeeks());
    expect(report.areas).toEqual([
      { goal: { id: "g1", title: "Thesis", color: "indigo", icon: "graduation" }, minutes: 240 },
      { goal: null, minutes: 90 },
    ]);
  });

  it("counts sessions by weekday and by part of the day, and names the best part and the longest session", () => {
    const report = buildPeriod(twoWeeks());
    expect(report.weekdays).toEqual([2, 1, 2, 0, 0, 0, 0]);
    expect(report.hours).toEqual([
      { block: "early", sessions: 0, score: null },
      { block: "morning", sessions: 3, score: 98 },
      { block: "midday", sessions: 0, score: null },
      { block: "afternoon", sessions: 0, score: null },
      { block: "late", sessions: 2, score: 75 },
    ]);
    expect(report.bestBlock).toBe("morning");
    expect(report.longest).toEqual({ minutes: 90, date: "2026-11-11", goal: "Thesis" });
    expect(report.topSites).toEqual([
      { domain: "instagram.com", count: 1 },
      { domain: "youtube.com", count: 1 },
    ]);
  });

  it("writes what went well, what did not and a summary from those numbers", () => {
    const { insights } = buildPeriod(twoWeeks());
    expect(insights.good).toEqual(["750% more focus time than in the 2 weeks before.", "Your focus score rose from 75 to 98."]);
    expect(insights.bad).toEqual(["Sessions that start after 4 pm score 75 on average, 23 below your best hours (9 – 11 am)."]);
    expect(insights.summary).toBe(
      "You focused 4 h 15 min in 5 sessions over 2 weeks, 750% more than in the 2 weeks before. Your focus score went from 75 to 98. You reached your goals in 1 of 2 goal weeks.",
    );
  });

  it("says a goal keeps slipping when it was never reached, and that focus time grew when it did three weeks running", () => {
    const input = twoWeeks();
    input.period = { from: "2026-10-26", to: "2026-11-09", weeks: 3 };
    input.sessions.push(session("2026-10-27T09:00:00Z", "2026-10-27T09:30:00Z", 30, 30));
    input.events = input.events.filter((e) => e.id !== "e2"); // W45 now has one of two as well
    const { insights } = buildPeriod(input);
    expect(insights.good[0]).toBe("Focus time grew 3 weeks in a row: 30 min, 1 h 15 min, 3 h.");
    expect(insights.bad).toContain("Thesis was not reached in any of the 3 weeks.");
    expect(insights.summary).toContain("Thesis is the goal that keeps slipping.");
  });

  it("is empty when the period has nothing, whatever lies before it", () => {
    const input = twoWeeks();
    input.period = { from: "2026-08-03", to: "2026-08-10", weeks: 2 };
    const report = buildPeriod(input);
    expect(report.empty).toBe(true);
    expect(report.totals.sessions).toBe(0);
    expect(report.goals).toEqual([]); // the goal did not exist yet
    expect(report.insights).toEqual({ good: [], bad: [], summary: "Nothing was recorded in this period." });
  });

  it("counts only the days that have begun when the period ends in the current week", () => {
    const input = twoWeeks();
    input.period = { from: "2026-11-16", to: "2026-11-16", weeks: 1 };
    expect(buildPeriod(input).totals.days).toBe(3); // Monday to Wednesday
  });

  it("puts a session into the week it starts in, in the user's time zone", () => {
    const input = twoWeeks();
    // Sunday 8 November 23:30 in New York is Monday 04:30 UTC: it belongs to W45 there.
    input.timeZone = "America/New_York";
    input.sessions = [session("2026-11-09T04:30:00Z", "2026-11-09T05:00:00Z", 30, 30)];
    input.attempts = [];
    const report = buildPeriod(input);
    expect(report.weeks.map((w) => w.sessions)).toEqual([1, 0]);
    expect(report.weekdays).toEqual([0, 0, 0, 0, 0, 0, 1]);
  });
});
