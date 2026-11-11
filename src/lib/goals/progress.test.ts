import { describe, expect, it } from "vitest";
import { countdownText, goalProgress, ruleAmount, ruleStatus, ruleText, type DoneEvent, type GoalInput, type Rule } from "./progress";

const LISBON = "Europe/Lisbon";
const COUNT_2_MIN_45: Rule = { id: "r1", kind: "count", target: 2, minMinutes: 45 };
const HOURS_6: Rule = { id: "r2", kind: "hours", target: 6, minMinutes: null };

/** A done event starting at `start` (ISO, UTC) lasting `minutes`. */
function done(start: string, minutes: number): DoneEvent {
  const startAt = new Date(start);
  return { startAt, endAt: new Date(startAt.getTime() + minutes * 60_000) };
}

function goal(fields: Partial<GoalInput>): GoalInput {
  return { createdAt: new Date("2026-11-02T10:00:00Z"), deadline: "2026-12-20", rules: [COUNT_2_MIN_45], doneEvents: [], ...fields };
}

describe("one rule in one week (R8)", () => {
  it("counts only events at least min_minutes long", () => {
    expect(ruleAmount(COUNT_2_MIN_45, [done("2026-11-10T09:00:00Z", 50), done("2026-11-11T09:00:00Z", 40)])).toBe(1);
    expect(ruleAmount(COUNT_2_MIN_45, [done("2026-11-10T09:00:00Z", 45)])).toBe(1);
  });

  it("counts every event when there is no minimum, and adds the minutes for hours", () => {
    expect(ruleAmount({ ...COUNT_2_MIN_45, minMinutes: null }, [done("2026-11-10T09:00:00Z", 10)])).toBe(1);
    expect(ruleAmount(HOURS_6, [done("2026-11-10T09:00:00Z", 90), done("2026-11-11T09:00:00Z", 120)])).toBe(210);
  });

  it("is met when the target is reached, missed when the week ended unmet, else open", () => {
    expect(ruleStatus(COUNT_2_MIN_45, 2, { ended: false, isCreationWeek: false })).toBe("met");
    expect(ruleStatus(COUNT_2_MIN_45, 1, { ended: true, isCreationWeek: false })).toBe("missed");
    expect(ruleStatus(COUNT_2_MIN_45, 1, { ended: false, isCreationWeek: false })).toBe("open");
    expect(ruleStatus(HOURS_6, 360, { ended: true, isCreationWeek: false })).toBe("met");
    expect(ruleStatus(HOURS_6, 359, { ended: true, isCreationWeek: false })).toBe("missed");
  });

  it("never marks the creation week missed", () => {
    expect(ruleStatus(COUNT_2_MIN_45, 0, { ended: true, isCreationWeek: true })).toBe("open");
  });

  it("writes the ontology's texts", () => {
    expect(ruleText(COUNT_2_MIN_45, 1)).toBe("This week: 1 of 2 done");
    expect(ruleText(HOURS_6, 210)).toBe("This week: 3.5 of 6 h");
    expect(ruleText({ ...HOURS_6, target: 0.5 }, 100)).toBe("This week: 1.6 of 0.5 h");
  });
});

describe("A1: goal created last week, count 2 with min_minutes 45, runs of 50 and 40 minutes done", () => {
  // The goal was created on Tuesday 3 November ("last week" when the scenario starts); the runs are
  // done in the week of 9 November, which then ends. That week is not the creation week, so it can be missed.
  const a1 = goal({
    createdAt: new Date("2026-11-03T10:00:00Z"),
    doneEvents: [done("2026-11-10T07:00:00Z", 50), done("2026-11-12T07:00:00Z", 40)],
  });

  it("shows '1 of 2 done' while the week runs", () => {
    const duringTheWeek = goalProgress(a1, new Date("2026-11-13T12:00:00Z"), LISBON);
    expect(duringTheWeek.thisWeek).toEqual([{ ruleId: "r1", text: "This week: 1 of 2 done", status: "open" }]);
  });

  it("marks that week missed once it has ended", () => {
    const afterwards = goalProgress(a1, new Date("2026-11-16T09:00:00Z"), LISBON);
    expect(afterwards.weeks.find((w) => w.monday === "2026-11-09")).toEqual({ monday: "2026-11-09", status: "missed", isCurrent: false });
  });
});

describe("the strip of weeks (R9)", () => {
  const now = new Date("2026-11-18T12:00:00Z"); // Wednesday of the week of 16 November

  it("runs from the creation week to the deadline week: past weeks met or missed, the creation week never missed", () => {
    const progress = goalProgress(
      goal({
        createdAt: new Date("2026-11-04T10:00:00Z"), // week of 2 November, nothing done: open, not missed
        deadline: "2026-11-30",
        doneEvents: [done("2026-11-10T09:00:00Z", 60), done("2026-11-12T09:00:00Z", 60)], // week of 9 November: met
      }),
      now,
      LISBON,
    );
    expect(progress.weeks).toEqual([
      { monday: "2026-11-02", status: "open", isCurrent: false },
      { monday: "2026-11-09", status: "met", isCurrent: false },
      { monday: "2026-11-16", status: "open", isCurrent: true },
      { monday: "2026-11-23", status: "open", isCurrent: false },
      { monday: "2026-11-30", status: "open", isCurrent: false },
    ]);
  });

  it("judges no week after the deadline", () => {
    const progress = goalProgress(goal({ createdAt: new Date("2026-10-26T10:00:00Z"), deadline: "2026-11-04" }), now, LISBON);
    expect(progress.weeks.map((w) => w.monday)).toEqual(["2026-10-26", "2026-11-02"]);
    expect(progress.weeks[1].status).toBe("missed");
    expect(progress.countdown).toBe("Deadline passed");
  });

  it("needs every rule met for a met week, and one missed rule makes the week missed", () => {
    const rules = [COUNT_2_MIN_45, HOURS_6];
    const twoRuns = [done("2026-11-10T09:00:00Z", 60), done("2026-11-12T09:00:00Z", 60)]; // count met, 2 of 6 h
    const progress = goalProgress(goal({ rules, doneEvents: twoRuns }), now, LISBON);
    expect(progress.weeks.find((w) => w.monday === "2026-11-09")?.status).toBe("missed");
  });

  it("puts an event in the week it starts in, in the user's time zone", () => {
    // Monday 16 November, 03:00 UTC is Sunday 15 November, 22:00 in New York: the week of 9 November there.
    const progress = goalProgress(
      goal({ rules: [{ ...COUNT_2_MIN_45, target: 1 }], doneEvents: [done("2026-11-16T03:00:00Z", 60)] }),
      now,
      "America/New_York",
    );
    expect(progress.weeks.find((w) => w.monday === "2026-11-09")?.status).toBe("met");
    expect(progress.thisWeek[0].text).toBe("This week: 0 of 1 done");
  });
});

describe("the countdown (R9)", () => {
  it("counts the days to the deadline", () => {
    expect(countdownText("2026-11-28", "2026-11-16")).toBe("12 days left");
    expect(countdownText("2026-11-17", "2026-11-16")).toBe("1 day left");
    expect(countdownText("2026-11-16", "2026-11-16")).toBe("Due today");
    expect(countdownText("2026-11-15", "2026-11-16")).toBe("Deadline passed");
  });
});
