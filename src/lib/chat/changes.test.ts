// Tests for R23 extended (spec 20): moves and deletes of existing events in an answer, named by the
// reference of this one request; which events the coach may change; the checks on the calendar as it
// would be after the whole draft. Each rule with an accepted and a rejected case.
import { describe, expect, it } from "vitest";
import { checkAnswer, checkDraft, isChangeable, type ChangeTarget, type CheckContext } from "./checks";

// Monday 16 November 2026, 09:00 in Lisbon (UTC+0 in winter).
const NOW = new Date("2026-11-16T09:00:00Z");

const target = (id: string, start: string, end: string, more: Partial<ChangeTarget> = {}): ChangeTarget => ({
  id,
  updatedAt: "2026-11-10T00:00:00.000Z",
  title: "Lecture",
  goalId: null,
  startAt: new Date(`${start}:00Z`),
  endAt: new Date(`${end}:00Z`),
  mayOverlap: false,
  ...more,
});

// e1: Tuesday 14:00-15:00, e2: Tuesday 17:00-18:00, e3: an Outlook event (not changeable).
const LECTURE = target("id-1", "2026-11-17T14:00", "2026-11-17T15:00");
const GYM = target("id-2", "2026-11-17T17:00", "2026-11-17T18:00", { title: "Gym" });
const PODCAST = target("id-4", "2026-11-17T19:00", "2026-11-17T20:00", { title: "Podcast", mayOverlap: true });

const block = (t: ChangeTarget) => ({ id: t.id, startAt: t.startAt, endAt: t.endAt, mayOverlap: t.mayOverlap });

const context = (change: Partial<CheckContext> = {}): CheckContext => ({
  now: NOW,
  timeZone: "Europe/Lisbon",
  goalIds: new Set(),
  calendar: [block(LECTURE), block(GYM), block(PODCAST)],
  targets: new Map<string, ChangeTarget | null>([
    ["e1", LECTURE],
    ["e2", GYM],
    ["e3", null],
    ["e4", PODCAST],
  ]),
  ...change,
});

const ev = (start: string, end: string, title = "Study") => ({ title, start, end, goalId: null });
const mv = (ref: string, start: string, end: string) => ({ ref, action: "move", start, end });
const del = (ref: string) => ({ ref, action: "delete", start: null, end: null });
const answer = (events: unknown[], changes: unknown[]) => ({ kind: "draft", text: "Done.", events, changes });

describe("isChangeable (decision 3)", () => {
  const base = { allDay: false, source: "app", seriesId: null, startAt: new Date("2026-11-17T09:00:00Z") };
  it("the user's own timed app or assistant event that has not started", () => {
    expect(isChangeable(base, NOW)).toBe(true);
    expect(isChangeable({ ...base, source: "assistant" }, NOW)).toBe(true);
  });
  it("not an Outlook event, an all-day event, an event of a series, or one that has started", () => {
    expect(isChangeable({ ...base, source: "outlook" }, NOW)).toBe(false);
    expect(isChangeable({ ...base, allDay: true, startAt: null }, NOW)).toBe(false);
    expect(isChangeable({ ...base, seriesId: "s1" }, NOW)).toBe(false);
    expect(isChangeable({ ...base, startAt: NOW }, NOW)).toBe(false);
    expect(isChangeable({ ...base, startAt: new Date("2026-11-16T08:00:00Z") }, NOW)).toBe(false);
  });
});

describe("checkAnswer with changes: accepted", () => {
  it("a move and a delete, turned back into the events; times in the user's time zone", () => {
    const result = checkAnswer(answer([], [mv("e1", "2026-11-17T16:00", "2026-11-17T17:00"), del("e2")]), context());
    expect(result).toEqual({
      ok: true,
      value: {
        kind: "draft",
        text: "Done.",
        proposals: [],
        changes: [
          { kind: "move", target: LECTURE, startAt: new Date("2026-11-17T16:00:00Z"), endAt: new Date("2026-11-17T17:00:00Z") },
          { kind: "delete", target: GYM },
        ],
      },
    });
  });

  it("a deleted or moved event no longer blocks its old time: a new event may take it", () => {
    // Study 14:00-15:00 where the lecture was; the lecture moves to 17:00 where the gym was.
    const result = checkAnswer(
      answer([ev("2026-11-17T14:00", "2026-11-17T15:00")], [mv("e1", "2026-11-17T17:00", "2026-11-17T18:00"), del("e2")]),
      context(),
    );
    expect(result.ok).toBe(true);
  });

  it("an event that may overlap never blocks; a moved event that may overlap may lie on it too", () => {
    expect(checkAnswer(answer([], [mv("e1", "2026-11-17T19:00", "2026-11-17T20:00")]), context()).ok).toBe(true);
    expect(checkAnswer(answer([], [mv("e4", "2026-11-17T21:00", "2026-11-17T22:00")]), context()).ok).toBe(true);
  });

  it("a move may last up to 24 hours (edit_event's limit) and start on the last minute of the 14th day", () => {
    expect(checkAnswer(answer([], [mv("e1", "2026-11-20T08:00", "2026-11-21T08:00")]), context()).ok).toBe(true);
    expect(checkAnswer(answer([], [mv("e1", "2026-11-30T23:45", "2026-12-01T00:45")]), context()).ok).toBe(true);
  });

  it("an answer without a list of changes (step A's format) still reads", () => {
    expect(checkAnswer({ kind: "draft", text: "x", events: [ev("2026-11-17T09:00", "2026-11-17T10:00")] }, context()).ok).toBe(true);
  });

  it("30 things in all", () => {
    const events = Array.from({ length: 29 }, (_, i) => ev(`2026-11-${18 + Math.floor(i / 10)}T${String(8 + (i % 10)).padStart(2, "0")}:00`, `2026-11-${18 + Math.floor(i / 10)}T${String(8 + (i % 10)).padStart(2, "0")}:30`));
    expect(checkAnswer(answer(events, [del("e2")]), context()).ok).toBe(true);
  });
});

describe("checkAnswer with changes: rejected, the whole answer", () => {
  it.each([
    ["an unknown reference", answer([], [del("e9")]), "unknown_ref"],
    ["an event id instead of a reference", answer([], [del("id-1")]), "unknown_ref"],
    ["an event the coach may not change", answer([], [del("e3")]), "not_changeable"],
    ["the same event twice", answer([], [del("e1"), mv("e1", "2026-11-17T16:00", "2026-11-17T17:00")]), "changed_twice"],
    ["a delete with times", answer([], [{ ref: "e1", action: "delete", start: "2026-11-17T16:00", end: null }]), "shape"],
    ["an unknown action", answer([], [{ ref: "e1", action: "rename", start: null, end: null }]), "shape"],
    ["an extra field in a change", answer([], [{ ...del("e1"), title: "x" }]), "shape"],
    ["a move without times", answer([], [{ ref: "e1", action: "move", start: null, end: null }]), "bad_time"],
    ["a move to a time that does not exist", answer([], [mv("e1", "2026-11-31T09:00", "2026-11-31T10:00")]), "bad_time"],
    ["a move into the past", answer([], [mv("e1", "2026-11-16T08:45", "2026-11-16T10:00")]), "start_in_past"],
    ["a move after the 14th day", answer([], [mv("e1", "2026-12-01T00:00", "2026-12-01T01:00")]), "start_too_late"],
    ["a move ending before it starts", answer([], [mv("e1", "2026-11-17T16:00", "2026-11-17T15:00")]), "end_before_start"],
    ["a move of more than 24 hours", answer([], [mv("e1", "2026-11-20T08:00", "2026-11-21T08:01")]), "too_long"],
    ["a move onto an event that may not overlap", answer([], [mv("e1", "2026-11-17T17:30", "2026-11-17T18:30")]), "overlaps_calendar"],
    ["a move onto a new event", answer([ev("2026-11-17T10:00", "2026-11-17T11:00")], [mv("e1", "2026-11-17T10:30", "2026-11-17T11:30")]), "overlaps_proposal"],
    ["two moves onto each other", answer([], [mv("e1", "2026-11-18T10:00", "2026-11-18T11:00"), mv("e2", "2026-11-18T10:30", "2026-11-18T11:30")]), "overlaps_proposal"],
    ["a new event on a moved event's new time", answer([ev("2026-11-17T16:00", "2026-11-17T17:00")], [mv("e1", "2026-11-17T16:30", "2026-11-17T17:30")]), "overlaps_proposal"],
    ["a new event on an event that stays", answer([ev("2026-11-17T17:30", "2026-11-17T18:30")], [del("e1")]), "overlaps_calendar"],
    ["a text answer with changes", { kind: "text", text: "x", events: [], changes: [del("e1")] }, "text_with_events"],
    ["31 things in all", answer(Array.from({ length: 30 }, () => ev("2026-11-18T09:00", "2026-11-18T10:00")), [del("e1")]), "too_many_events"],
  ])("rejects %s", (_case, raw, failure) => {
    expect(checkAnswer(raw, context())).toEqual({ ok: false, failure });
  });

  it("without references (no targets), every change is unknown", () => {
    expect(checkAnswer(answer([], [del("e1")]), context({ targets: undefined }))).toEqual({ ok: false, failure: "unknown_ref" });
  });

  it("an event that started after the data block was made can no longer be changed", () => {
    expect(checkAnswer(answer([], [del("e1")]), context({ now: new Date("2026-11-17T14:00:00Z") }))).toEqual({
      ok: false,
      failure: "not_changeable",
    });
  });
});

describe("checkDraft (accept_draft runs it again on the saved draft)", () => {
  const changes = [{ kind: "move" as const, target: LECTURE, startAt: new Date("2026-11-18T10:00:00Z"), endAt: new Date("2026-11-18T11:00:00Z") }];

  it("passes while nothing changed; a draft of changes only is fine", () => {
    expect(checkDraft([], changes, context()).ok).toBe(true);
  });

  it("fails on an empty draft, once a moved event has started, or when a new event now stands at the new time", () => {
    expect(checkDraft([], [], context())).toEqual({ ok: false, failure: "no_events" });
    expect(checkDraft([], changes, context({ now: new Date("2026-11-17T14:30:00Z") }))).toEqual({ ok: false, failure: "not_changeable" });
    const calendar = [...context().calendar, { id: "new", startAt: new Date("2026-11-18T10:30:00Z"), endAt: new Date("2026-11-18T11:30:00Z"), mayOverlap: false }];
    expect(checkDraft([], changes, context({ calendar }))).toEqual({ ok: false, failure: "overlaps_calendar" });
  });
});
