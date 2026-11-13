// Tests for the pure part of edit_draft (spec 22): the draft as it would be with one block at new
// times, the block staying on its day, the refusal sentences, the screen's at-once copy, the mark
// "adjusted by the person" in what Claude receives, and the fixed prompt's sentence about it.
import { describe, expect, it } from "vitest";
import type { Change, ChangeTarget, Proposal } from "./checks";
import { editRefusal, itemKey, withBlockAt, withEditedBlock } from "./edit";
import { buildAssistantInput } from "./input";
import { SYSTEM_PROMPT } from "./prompt";
import { chatTotals } from "./totals";
import type { DraftDto } from "./types";

const TZ = "Europe/Lisbon";
const at = (iso: string) => new Date(iso);

const study: Proposal = { title: "Study", startAt: at("2026-11-17T08:00:00Z"), endAt: at("2026-11-17T10:00:00Z"), goalId: "g1", todos: ["Read"] };
const run: Proposal = { title: "Run", startAt: at("2026-11-17T18:00:00Z"), endAt: at("2026-11-17T19:00:00Z"), goalId: null };
const target: ChangeTarget = {
  id: "ev-1",
  updatedAt: "2026-11-10T00:00:00.000Z",
  title: "Lecture",
  goalId: null,
  startAt: at("2026-11-17T14:00:00Z"),
  endAt: at("2026-11-17T15:00:00Z"),
  mayOverlap: false,
};
const moveLecture: Change = { kind: "move", target, startAt: at("2026-11-17T16:00:00Z"), endAt: at("2026-11-17T17:00:00Z") };
const deleteGym: Change = { kind: "delete", target: { ...target, id: "ev-2", title: "Gym" } };

describe("withEditedBlock", () => {
  it("replaces only the times of the one new event; title, goal and to-dos stay", () => {
    const result = withEditedBlock([study, run], [moveLecture], { kind: "new", index: 0 }, at("2026-11-17T09:00:00Z"), at("2026-11-17T11:00:00Z"), TZ);
    expect(result).toEqual({
      ok: true,
      proposals: [{ ...study, startAt: at("2026-11-17T09:00:00Z"), endAt: at("2026-11-17T11:00:00Z") }, run],
      changes: [moveLecture],
    });
  });

  it("replaces only the times of the one move; the event it names stays", () => {
    const result = withEditedBlock([study], [moveLecture, deleteGym], { kind: "move", eventId: "ev-1" }, at("2026-11-17T20:00:00Z"), at("2026-11-17T21:00:00Z"), TZ);
    expect(result.ok && result.changes).toEqual([{ ...moveLecture, startAt: at("2026-11-17T20:00:00Z"), endAt: at("2026-11-17T21:00:00Z") }, deleteGym]);
  });

  it("finds no block for a place outside the list, a delete or an event the draft does not move", () => {
    for (const item of [
      { kind: "new" as const, index: 2 },
      { kind: "new" as const, index: -1 },
      { kind: "new" as const, index: 0.5 },
      { kind: "move" as const, eventId: "ev-2" },
      { kind: "move" as const, eventId: "ev-9" },
    ]) {
      expect(withEditedBlock([study, run], [moveLecture, deleteGym], item, at("2026-11-17T09:00:00Z"), at("2026-11-17T10:00:00Z"), TZ), JSON.stringify(item)).toEqual({
        ok: false,
        failure: "not_found",
      });
    }
  });

  it("keeps a block on its day: another day or an end past midnight is refused, midnight itself is fine", () => {
    const item = { kind: "new" as const, index: 1 };
    expect(withEditedBlock([study, run], [], item, at("2026-11-18T09:00:00Z"), at("2026-11-18T10:00:00Z"), TZ)).toEqual({ ok: false, failure: "other_day" });
    expect(withEditedBlock([study, run], [], item, at("2026-11-17T23:00:00Z"), at("2026-11-18T00:15:00Z"), TZ)).toEqual({ ok: false, failure: "other_day" });
    expect(withEditedBlock([study, run], [], item, at("2026-11-17T23:00:00Z"), at("2026-11-18T00:00:00Z"), TZ).ok).toBe(true);
    // The day is the user's: 00:30 on the 18th in Berlin is still the 17th in UTC.
    expect(withEditedBlock([study, run], [], item, at("2026-11-17T23:30:00Z"), at("2026-11-17T23:45:00Z"), "Europe/Berlin")).toEqual({ ok: false, failure: "other_day" });
  });
});

describe("editRefusal", () => {
  it("speaks the ontology's sentences", () => {
    const newItem = { kind: "new" as const, index: 0 };
    const moveItem = { kind: "move" as const, eventId: "ev-1" };
    expect(editRefusal("overlaps_proposal", newItem).message).toBe("This would overlap another event");
    expect(editRefusal("overlaps_calendar", moveItem).message).toBe("This would overlap another event");
    expect(editRefusal("too_short", newItem).message).toBe("A new event lasts 15 minutes to 8 hours");
    expect(editRefusal("too_long", newItem).message).toBe("A new event lasts 15 minutes to 8 hours");
    expect(editRefusal("too_long", moveItem).message).toBe("An event can last at most 24 hours");
    expect(editRefusal("end_before_start", newItem).message).toBe("End must be after start");
    expect(editRefusal("start_in_past", newItem).message).toBe("This time is in the past");
    expect(editRefusal("start_too_late", newItem).message).toBe("The coach plans only the next 14 days");
    expect(editRefusal("other_day", newItem).message).toBe("A block stays on its day. Ask the coach to move it to another day");
    expect(editRefusal("not_found", newItem)).toEqual({ status: 404, code: "not_found", message: "Not found" });
    // A failure a drag cannot cause: the draft itself no longer passes.
    expect(editRefusal("unknown_goal", newItem).message).toBe("This draft is out of date. Ask again");
  });
});

describe("withBlockAt (the screen, before the server answers)", () => {
  const draft: DraftDto = {
    id: "d1",
    status: "open",
    version: 0,
    events: [
      { title: "Study", startAt: "2026-11-17T08:00:00.000Z", endAt: "2026-11-17T10:00:00.000Z", goalId: null, todos: ["Read"] },
      { title: "Run", startAt: "2026-11-17T18:00:00.000Z", endAt: "2026-11-17T19:00:00.000Z", goalId: null },
    ],
    changes: [
      { kind: "move", eventId: "ev-1", title: "Lecture", goalId: null, oldStartAt: "a", oldEndAt: "b", startAt: "c", endAt: "d" },
      { kind: "delete", eventId: "ev-2", title: "Gym", goalId: null, oldStartAt: "a", oldEndAt: "b", startAt: null, endAt: null },
    ],
  };

  it("moves the one block and nothing else", () => {
    const moved = withBlockAt(draft, { kind: "new", index: 1 }, "x", "y");
    expect(moved.events).toEqual([draft.events[0], { ...draft.events[1], startAt: "x", endAt: "y" }]);
    expect(moved.changes).toEqual(draft.changes);
    expect(withBlockAt(draft, { kind: "move", eventId: "ev-1" }, "x", "y").changes.map((c) => [c.startAt, c.endAt])).toEqual([
      ["x", "y"],
      [null, null],
    ]);
    expect(withBlockAt(draft, { kind: "move", eventId: "ev-2" }, "x", "y")).toEqual(draft);
  });

  it("names blocks by a short key", () => {
    expect(itemKey({ kind: "new", index: 3 })).toBe("new:3");
    expect(itemKey({ kind: "move", eventId: "ev-1" })).toBe("move:ev-1");
  });
});

describe("what Claude receives about a draft the person changed", () => {
  const NOW = new Date("2026-11-16T21:30:00Z");
  const history = (adjusted: boolean) => [
    {
      role: "assistant" as const,
      text: "Here is your day.",
      draft: { status: "open" as const, ...(adjusted ? { adjusted: true } : {}), events: [{ title: "Run", startAt: at("2026-11-17T18:00:00Z"), endAt: at("2026-11-17T19:00:00Z"), goalId: null }] },
    },
  ];
  const input = (adjusted: boolean) =>
    buildAssistantInput({
      now: NOW,
      timeZone: TZ,
      dayStartHour: 7,
      dayEndHour: 22,
      history: history(adjusted),
      goals: [],
      calendar: [],
      totals: chatTotals({ doneEvents: [], sessions: [], goals: [] }, NOW, TZ),
      message: "Add a short walk",
    });

  it("marks an adjusted draft 'adjusted by the person', and only that one", () => {
    expect(input(true).history[0]).toMatchObject({ draftStatus: "open", draftNote: "adjusted by the person" });
    expect(input(false).history[0]).not.toHaveProperty("draftNote");
  });

  it("the fixed prompt says to build on an adjusted draft and not to put its blocks back", () => {
    for (const phrase of ['"draftNote": "adjusted by the person"', "Build on that draft as it is now", "do not put its blocks back"]) {
      expect(SYSTEM_PROMPT, phrase).toContain(phrase);
    }
  });
});
