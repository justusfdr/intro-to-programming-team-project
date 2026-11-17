// Spec 43 (R23 extended): a new event of a draft that names a goal never starts on a weekday the goal
// is never done on. Accepted and rejected cases, the boundary, the time zone, and what is not affected.
import { describe, expect, it } from "vitest";
import { checkAnswer, checkDraft, type ChangeTarget, type CheckContext } from "./checks";
import { withEditedBlock } from "./edit";

const GYM = "0b9c8d7e-6f5a-4b3c-9d2e-1f0a9b8c7d6e";
const STUDY = "7f1d5c3e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
// Monday 16 November 2026, 09:00 in Lisbon (UTC+0 in winter).
const NOW = new Date("2026-11-16T09:00:00Z");

// The gym is never done on Fridays (5).
const context = (change: Partial<CheckContext> = {}): CheckContext => ({
  now: NOW,
  timeZone: "Europe/Lisbon",
  goalIds: new Set([GYM, STUDY]),
  calendar: [],
  neverDays: new Map([[GYM, [5]]]),
  ...change,
});

const answer = (start: string, end: string, goalId: string | null = GYM) => ({
  kind: "draft",
  text: "Here is your week.",
  events: [{ title: "Gym", start, end, goalId, todos: [] }],
  changes: [],
  addTodos: [],
});

describe("the never-day check", () => {
  it("accepts a session on an allowed day", () => {
    expect(checkAnswer(answer("2026-11-19T18:00", "2026-11-19T19:30"), context()).ok).toBe(true);
  });

  it("rejects a session on a never day, and the whole answer with it", () => {
    expect(checkAnswer(answer("2026-11-20T18:00", "2026-11-20T19:30"), context())).toEqual({ ok: false, failure: "never_day" });
    const two = answer("2026-11-19T18:00", "2026-11-19T19:30");
    two.events.push({ title: "Gym", start: "2026-11-20T18:00", end: "2026-11-20T19:30", goalId: GYM, todos: [] });
    expect(checkAnswer(two, context())).toEqual({ ok: false, failure: "never_day" });
  });

  it("the start decides: 23:30 on Thursday into Friday passes; 00:00 on Friday does not", () => {
    expect(checkAnswer(answer("2026-11-19T23:30", "2026-11-20T00:30"), context()).ok).toBe(true);
    expect(checkAnswer(answer("2026-11-20T00:00", "2026-11-20T01:00"), context())).toEqual({ ok: false, failure: "never_day" });
  });

  it("the person's time zone decides the weekday", () => {
    // 23:30 on Thursday in Lisbon is 00:30 on Friday in Berlin (same instant, given in each zone's time).
    expect(checkAnswer(answer("2026-11-19T23:30", "2026-11-20T00:30"), context()).ok).toBe(true);
    expect(checkAnswer(answer("2026-11-20T00:30", "2026-11-20T01:30"), context({ timeZone: "Europe/Berlin" }))).toEqual({
      ok: false,
      failure: "never_day",
    });
    // The same instant, checked as proposals with instants: Thursday in Lisbon, Friday in Berlin.
    const proposal = { title: "Gym", startAt: new Date("2026-11-19T23:30:00Z"), endAt: new Date("2026-11-20T00:30:00Z"), goalId: GYM };
    expect(checkDraft([proposal], [], context()).ok).toBe(true);
    expect(checkDraft([proposal], [], context({ timeZone: "Europe/Berlin" }))).toEqual({ ok: false, failure: "never_day" });
  });

  it("an event without a goal, or of a goal without never days, is not affected", () => {
    expect(checkAnswer(answer("2026-11-20T18:00", "2026-11-20T19:30", null), context()).ok).toBe(true);
    expect(checkAnswer(answer("2026-11-20T18:00", "2026-11-20T19:30", STUDY), context()).ok).toBe(true);
  });

  it("without the context's never days (every caller before spec 43), nothing changes", () => {
    expect(checkAnswer(answer("2026-11-20T18:00", "2026-11-20T19:30"), context({ neverDays: undefined })).ok).toBe(true);
  });

  it("a moved existing event of the goal is not affected, nor the person's own events in the calendar", () => {
    const target: ChangeTarget = {
      id: "ev-gym",
      updatedAt: "2026-11-10T00:00:00.000Z",
      title: "Gym",
      goalId: GYM,
      startAt: new Date("2026-11-19T18:00:00Z"),
      endAt: new Date("2026-11-19T19:00:00Z"),
      mayOverlap: false,
    };
    const moved = checkDraft([], [{ kind: "move", target, startAt: new Date("2026-11-20T18:00:00Z"), endAt: new Date("2026-11-20T19:00:00Z") }], context());
    expect(moved.ok).toBe(true);
    // A gym event already on Friday in the calendar: a new event on Thursday passes.
    const calendar = [{ id: "own", startAt: new Date("2026-11-20T18:00:00Z"), endAt: new Date("2026-11-20T19:00:00Z"), mayOverlap: false }];
    expect(checkAnswer(answer("2026-11-19T18:00", "2026-11-19T19:30"), context({ calendar })).ok).toBe(true);
  });

  it("dragging: the draft with the block at its new times is checked again", () => {
    // A block that would start on Friday (only possible within its own day, so a block already there).
    const proposal = { title: "Gym", startAt: new Date("2026-11-20T18:00:00Z"), endAt: new Date("2026-11-20T19:00:00Z"), goalId: GYM };
    const edited = withEditedBlock([proposal], [], { kind: "new", index: 0 }, new Date("2026-11-20T19:00:00Z"), new Date("2026-11-20T20:00:00Z"), "Europe/Lisbon");
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(checkDraft(edited.proposals, edited.changes, context())).toEqual({ ok: false, failure: "never_day" });
  });
});
