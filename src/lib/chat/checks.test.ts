// Tests for R23's checks (spec 19): each check with an accepted and a rejected case, and that one
// failure rejects the whole answer.
import { describe, expect, it } from "vitest";
import { checkAnswer, checkProposals, checkText, insideVisibleHours, latestStart, type CheckContext } from "./checks";

const GOAL = "7f1d5c3e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
// Monday 16 November 2026, 09:00 in Lisbon (UTC+0 in winter).
const NOW = new Date("2026-11-16T09:00:00Z");

const context = (change: Partial<CheckContext> = {}): CheckContext => ({
  now: NOW,
  timeZone: "Europe/Lisbon",
  goalIds: new Set([GOAL]),
  calendar: [],
  ...change,
});

const event = (start: string, end: string, more: Partial<{ title: string; goalId: string | null }> = {}) => ({
  title: "Study",
  start,
  end,
  goalId: null,
  ...more,
});

const draft = (...events: ReturnType<typeof event>[]) => ({ kind: "draft", text: "Here is your Tuesday.", events });

// A5: study 08:00-13:00, call 13:30-14:00, sport 18:00-19:30, event 20:00-22:30 on Tuesday 17 November.
const A5 = draft(
  event("2026-11-17T08:00", "2026-11-17T13:00", { goalId: GOAL }),
  event("2026-11-17T13:30", "2026-11-17T14:00", { title: "Call" }),
  event("2026-11-17T18:00", "2026-11-17T19:30", { title: "Sport" }),
  event("2026-11-17T20:00", "2026-11-17T22:30", { title: "Event" }),
);

describe("checkAnswer accepted", () => {
  it("a text answer: trimmed, no events", () => {
    expect(checkAnswer({ kind: "text", text: "  You spent 150 minutes.  ", events: [] }, context())).toEqual({
      ok: true,
      value: { kind: "text", text: "You spent 150 minutes." },
    });
  });

  it("A5: four proposals for tomorrow, turned into instants in the user's time zone", () => {
    const result = checkAnswer(A5, context());
    expect(result.ok && result.value.kind === "draft" && result.value.proposals).toEqual([
      { title: "Study", startAt: new Date("2026-11-17T08:00:00Z"), endAt: new Date("2026-11-17T13:00:00Z"), goalId: GOAL },
      { title: "Call", startAt: new Date("2026-11-17T13:30:00Z"), endAt: new Date("2026-11-17T14:00:00Z"), goalId: null },
      { title: "Sport", startAt: new Date("2026-11-17T18:00:00Z"), endAt: new Date("2026-11-17T19:30:00Z"), goalId: null },
      { title: "Event", startAt: new Date("2026-11-17T20:00:00Z"), endAt: new Date("2026-11-17T22:30:00Z"), goalId: null },
    ]);
  });

  it("uses the user's time zone: 09:00 in Berlin is 08:00 UTC", () => {
    const result = checkAnswer(draft(event("2026-11-17T09:00", "2026-11-17T10:00")), context({ timeZone: "Europe/Berlin" }));
    expect(result.ok && result.value.kind === "draft" && result.value.proposals[0].startAt).toEqual(new Date("2026-11-17T08:00:00Z"));
  });

  it("accepts the edges: exactly 15 minutes, exactly 8 hours, starting now, the last minute of the 14th day, 30 events", () => {
    expect(checkAnswer(draft(event("2026-11-17T09:00", "2026-11-17T09:15")), context()).ok).toBe(true);
    expect(checkAnswer(draft(event("2026-11-17T09:00", "2026-11-17T17:00")), context()).ok).toBe(true);
    expect(checkAnswer(draft(event("2026-11-16T09:00", "2026-11-16T10:00")), context()).ok).toBe(true);
    expect(checkAnswer(draft(event("2026-11-30T23:45", "2026-12-01T00:30")), context()).ok).toBe(true);
    const thirty = Array.from({ length: 30 }, (_, i) => event(`2026-11-${String(17 + Math.floor(i / 10)).padStart(2, "0")}T${String(8 + (i % 10)).padStart(2, "0")}:00`, `2026-11-${String(17 + Math.floor(i / 10)).padStart(2, "0")}T${String(8 + (i % 10)).padStart(2, "0")}:30`));
    expect(checkAnswer(draft(...thirty), context()).ok).toBe(true);
  });

  it("accepts touching events and overlap with an event that may overlap or with an all-day event", () => {
    const calendar = [
      { startAt: new Date("2026-11-17T10:00:00Z"), endAt: new Date("2026-11-17T11:00:00Z"), mayOverlap: false },
      { startAt: new Date("2026-11-17T12:00:00Z"), endAt: new Date("2026-11-17T13:00:00Z"), mayOverlap: true },
    ];
    const answer = draft(
      event("2026-11-17T09:00", "2026-11-17T10:00"),
      event("2026-11-17T11:00", "2026-11-17T12:30"),
    );
    expect(checkAnswer(answer, context({ calendar })).ok).toBe(true);
  });

  it("accepts a goal id of the user's and an empty goal id as none; trims titles", () => {
    const result = checkAnswer(draft(event("2026-11-17T09:00", "2026-11-17T10:00", { goalId: "", title: "  Run  " })), context());
    expect(result.ok && result.value.kind === "draft" && result.value.proposals[0]).toMatchObject({ title: "Run", goalId: null });
  });
});

describe("checkAnswer rejected: one failed check rejects the whole answer", () => {
  it.each([
    ["not an object", "hello", "shape"],
    ["an unknown kind", { kind: "plan", text: "x", events: [] }, "shape"],
    ["an extra field", { kind: "text", text: "x", events: [], allDay: true }, "shape"],
    ["an extra field in an event", draft({ ...event("2026-11-17T09:00", "2026-11-17T10:00"), allDay: true } as never), "shape"],
    ["an empty text", { kind: "text", text: "   ", events: [] }, "text_length"],
    ["a text of 4,001 characters", { kind: "text", text: "x".repeat(4001), events: [] }, "text_length"],
    ["a text answer with events", { kind: "text", text: "x", events: [event("2026-11-17T09:00", "2026-11-17T10:00")] }, "text_with_events"],
    ["a draft without events", draft(), "no_events"],
    ["31 events", draft(...Array.from({ length: 31 }, () => event("2026-11-17T09:00", "2026-11-17T10:00"))), "too_many_events"],
    ["an empty title", draft(event("2026-11-17T09:00", "2026-11-17T10:00", { title: " " })), "title_length"],
    ["a 101-character title", draft(event("2026-11-17T09:00", "2026-11-17T10:00", { title: "x".repeat(101) })), "title_length"],
    ["a time in another format", draft(event("2026-11-17 09:00", "2026-11-17T10:00")), "bad_time"],
    ["a time with seconds or a zone", draft(event("2026-11-17T09:00:00Z", "2026-11-17T10:00")), "bad_time"],
    ["an all-day event (a date only)", draft(event("2026-11-17", "2026-11-18")), "bad_time"],
    ["a date that does not exist", draft(event("2026-11-31T09:00", "2026-11-31T10:00")), "bad_time"],
    ["a start in the past", draft(event("2026-11-16T08:45", "2026-11-16T10:00")), "start_in_past"],
    ["a start after the 14th day", draft(event("2026-12-01T00:00", "2026-12-01T01:00")), "start_too_late"],
    ["A6: 13:30 to 13:00", draft(event("2026-11-17T13:30", "2026-11-17T13:00")), "end_before_start"],
    ["a zero-length event", draft(event("2026-11-17T13:30", "2026-11-17T13:30")), "end_before_start"],
    ["14 minutes", draft(event("2026-11-17T09:00", "2026-11-17T09:14")), "too_short"],
    ["8 hours 1 minute", draft(event("2026-11-17T09:00", "2026-11-17T17:01")), "too_long"],
    ["a goal that is not the user's", draft(event("2026-11-17T09:00", "2026-11-17T10:00", { goalId: "00000000-0000-4000-8000-000000000000" })), "unknown_goal"],
    ["a goal id that is not an id", draft(event("2026-11-17T09:00", "2026-11-17T10:00", { goalId: "Half marathon" })), "unknown_goal"],
    ["two proposals that overlap", draft(event("2026-11-17T09:00", "2026-11-17T10:00"), event("2026-11-17T09:45", "2026-11-17T11:00")), "overlaps_proposal"],
  ])("rejects %s", (_case, raw, failure) => {
    expect(checkAnswer(raw, context())).toEqual({ ok: false, failure });
  });

  it("rejects an overlap with a timed event that may not overlap, even when the other proposals are fine", () => {
    const calendar = [{ startAt: new Date("2026-11-17T18:00:00Z"), endAt: new Date("2026-11-17T19:00:00Z"), mayOverlap: false }];
    expect(checkAnswer(A5, context({ calendar }))).toEqual({ ok: false, failure: "overlaps_calendar" });
  });

  it("rejects a time skipped by the spring clock change (01:30 on 29 March 2026 in Lisbon does not exist)", () => {
    const spring = new Date("2026-03-28T09:00:00Z");
    expect(checkAnswer(draft(event("2026-03-29T01:30", "2026-03-29T03:00")), context({ now: spring }))).toEqual({
      ok: false,
      failure: "bad_time",
    });
    expect(checkAnswer(draft(event("2026-03-29T03:00", "2026-03-29T04:00")), context({ now: spring })).ok).toBe(true);
  });
});

describe("checkProposals (accept_draft runs it again on the saved draft)", () => {
  const saved = [{ title: "Study", startAt: new Date("2026-11-17T08:00:00Z"), endAt: new Date("2026-11-17T13:00:00Z"), goalId: GOAL }];

  it("passes while nothing changed", () => {
    expect(checkProposals(saved, context()).ok).toBe(true);
  });

  it("fails once a proposed event has started, its goal is gone or a new event is in the way", () => {
    expect(checkProposals(saved, context({ now: new Date("2026-11-17T08:01:00Z") }))).toEqual({ ok: false, failure: "start_in_past" });
    expect(checkProposals(saved, context({ goalIds: new Set() }))).toEqual({ ok: false, failure: "unknown_goal" });
    const calendar = [{ startAt: new Date("2026-11-17T12:00:00Z"), endAt: new Date("2026-11-17T12:30:00Z"), mayOverlap: false }];
    expect(checkProposals(saved, context({ calendar }))).toEqual({ ok: false, failure: "overlaps_calendar" });
  });
});

describe("helpers", () => {
  it("checkText: 1 to 4,000 characters after trimming, counted as the user sees them", () => {
    expect(checkText(" Hi ")).toBe("Hi");
    expect(checkText("")).toBeNull();
    expect(checkText("😀".repeat(4000))).toBe("😀".repeat(4000));
    expect(checkText("😀".repeat(4001))).toBeNull();
  });

  it("latestStart: on 16 Nov, 30 Nov 24:00 in the user's time zone", () => {
    expect(latestStart(NOW, "Europe/Lisbon")).toEqual(new Date("2026-12-01T00:00:00Z"));
    expect(latestStart(NOW, "Europe/Berlin")).toEqual(new Date("2026-11-30T23:00:00Z"));
  });
});

describe("visible hours (Settings)", () => {
  const hours = { startHour: 7, endHour: 22 };
  const at = (s: string) => new Date(s);
  it("an event must start and end inside them, on one day; ending at midnight counts with endHour 24", () => {
    expect(insideVisibleHours(at("2026-11-18T07:00:00Z"), at("2026-11-18T08:00:00Z"), "UTC", hours)).toBe(true);
    expect(insideVisibleHours(at("2026-11-18T21:00:00Z"), at("2026-11-18T22:00:00Z"), "UTC", hours)).toBe(true);
    expect(insideVisibleHours(at("2026-11-18T03:00:00Z"), at("2026-11-18T04:00:00Z"), "UTC", hours)).toBe(false);
    expect(insideVisibleHours(at("2026-11-18T21:30:00Z"), at("2026-11-18T22:30:00Z"), "UTC", hours)).toBe(false);
    expect(insideVisibleHours(at("2026-11-18T23:00:00Z"), at("2026-11-19T00:00:00Z"), "UTC", { startHour: 0, endHour: 24 })).toBe(true);
    expect(insideVisibleHours(at("2026-11-18T23:00:00Z"), at("2026-11-19T01:00:00Z"), "UTC", { startHour: 0, endHour: 24 })).toBe(false);
  });
});
