// Tests for spec 67 (R23 as changed on 22 Nov 2026): send_message keeps what fits and names what it left
// out. The checks themselves are tested in checks*.test.ts; here: what is kept, what is left out and why,
// the order, the note and its length. Each rule with an accepted and a rejected case.
import { describe, expect, it } from "vitest";
import { MAX_TEXT, type ChangeTarget, type CheckContext, type TodoTarget } from "./checks";
import { checkAnswerKeepingWhatFits, leaveOut, NOTE_LINES, withNote, type Dropped, type NoteDisplay } from "./keep-what-fits";

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

const DISPLAY: NoteDisplay = { now: NOW, timeZone: "Europe/Lisbon", timeFormat: "24h", dayStartHour: 7, dayEndHour: 22 };

const event = (title: string, start: string, end: string, goalId: string | null = null) => ({ title, start, end, goalId });
const draft = (events: ReturnType<typeof event>[], more: Record<string, unknown> = {}) => ({ kind: "draft", text: "Here is your week.", events, ...more });

const LECTURE = { startAt: new Date("2026-11-17T10:00:00Z"), endAt: new Date("2026-11-17T12:00:00Z"), mayOverlap: false };

const target = (id: string, title: string, start: string, end: string): ChangeTarget => ({
  id,
  updatedAt: "2026-11-16T08:00:00.000Z",
  title,
  goalId: null,
  startAt: new Date(start),
  endAt: new Date(end),
  mayOverlap: false,
});

describe("what is kept", () => {
  it("everything that passes, with nothing left out (accepted)", () => {
    const result = checkAnswerKeepingWhatFits(draft([event("Gym", "2026-11-17T18:00", "2026-11-17T19:00")]), context({ calendar: [LECTURE] }));
    expect(result.ok && result.value.dropped).toEqual([]);
    expect(result.ok && result.value.answer.kind).toBe("draft");
  });

  it("a slot that clashes with the calendar is left out; the others stay (rejected item, accepted answer)", () => {
    const result = checkAnswerKeepingWhatFits(
      draft([event("Gym", "2026-11-17T11:00", "2026-11-17T12:00"), event("Investments", "2026-11-17T18:00", "2026-11-17T19:00")]),
      context({ calendar: [LECTURE] }),
    );
    if (!result.ok) throw new Error(result.failure);
    expect(result.value.answer.kind === "draft" && result.value.answer.proposals.map((p) => p.title)).toEqual(["Investments"]);
    expect(result.value.dropped).toEqual([
      { kind: "event", title: "Gym", startAt: new Date("2026-11-17T11:00:00Z"), endAt: new Date("2026-11-17T12:00:00Z"), reason: "overlaps_calendar" },
    ]);
  });

  it("of two slots that clash with each other, the first stays", () => {
    const result = checkAnswerKeepingWhatFits(
      draft([event("Gym", "2026-11-17T18:00", "2026-11-17T19:00"), event("Run", "2026-11-17T18:30", "2026-11-17T19:30")]),
      context(),
    );
    if (!result.ok) throw new Error(result.failure);
    expect(result.value.answer.kind === "draft" && result.value.answer.proposals.map((p) => p.title)).toEqual(["Gym"]);
    expect(result.value.dropped.map((d) => [d.kind === "event" && d.title, d.reason])).toEqual([["Run", "overlaps_proposal"]]);
  });

  it("changes come first: a move that is kept blocks a new event at its new time", () => {
    const call = target("ev-1", "Call", "2026-11-18T09:00:00Z", "2026-11-18T09:30:00Z");
    const result = checkAnswerKeepingWhatFits(
      draft([event("Gym", "2026-11-17T18:00", "2026-11-17T19:00")], { changes: [{ ref: "e1", action: "move", start: "2026-11-17T18:30", end: "2026-11-17T19:00" }] }),
      context({ targets: new Map([["e1", call]]) }),
    );
    if (!result.ok) throw new Error(result.failure);
    expect(result.value.answer.kind === "draft" && result.value.answer.changes.map((c) => c.target.title)).toEqual(["Call"]);
    expect(result.value.dropped.map((d) => d.reason)).toEqual(["overlaps_proposal"]);
  });

  it("a change to an event the coach may not change, or an unknown one, is left out", () => {
    const result = checkAnswerKeepingWhatFits(
      draft([event("Gym", "2026-11-17T18:00", "2026-11-17T19:00")], {
        changes: [
          { ref: "e1", action: "delete", start: null, end: null },
          { ref: "e9", action: "move", start: "2026-11-17T08:00", end: "2026-11-17T09:00" },
        ],
      }),
      context({ targets: new Map([["e1", null]]) }),
    );
    if (!result.ok) throw new Error(result.failure);
    expect(result.value.answer.kind === "draft" && result.value.answer.proposals.length).toBe(1);
    expect(result.value.dropped).toEqual([
      { kind: "delete", title: null, reason: "not_changeable" },
      { kind: "move", title: null, startAt: null, endAt: null, reason: "unknown_ref" },
    ]);
  });

  it("to-dos for an event the same draft deletes are left out; the delete stays", () => {
    const call = target("ev-1", "Call", "2026-11-18T09:00:00Z", "2026-11-18T09:30:00Z");
    const todoTarget: TodoTarget = { id: "ev-1", title: "Call", allDay: false, startAt: call.startAt, endAt: call.endAt, firstDay: null, lastDay: null, todoCount: 0 };
    const result = checkAnswerKeepingWhatFits(
      draft([], { changes: [{ ref: "e1", action: "delete", start: null, end: null }], addTodos: [{ ref: "e1", todos: ["Agenda"] }] }),
      context({ targets: new Map([["e1", call]]), todoTargets: new Map([["e1", todoTarget]]) }),
    );
    if (!result.ok) throw new Error(result.failure);
    expect(result.value.answer.kind === "draft" && result.value.answer.changes.map((c) => c.kind)).toEqual(["delete"]);
    expect(result.value.dropped).toEqual([{ kind: "todos", title: "Call", reason: "todos_on_deleted" }]);
  });

  it("with nothing left, the answer is a text answer", () => {
    const result = checkAnswerKeepingWhatFits(draft([event("Gym", "2026-11-17T11:00", "2026-11-17T12:00")]), context({ calendar: [LECTURE] }));
    expect(result.ok && result.value.answer).toEqual({ kind: "text", text: "Here is your week." });
  });

  it("what is kept passes the strict check again: titles and to-dos trimmed", () => {
    const result = checkAnswerKeepingWhatFits(draft([{ ...event("  Gym  ", "2026-11-17T18:00", "2026-11-17T19:00"), todos: [" Legs "] }]), context());
    expect(result.ok && result.value.answer.kind === "draft" && result.value.answer.proposals[0]).toMatchObject({ title: "Gym", todos: ["Legs"] });
  });
});

describe("what still rejects the whole answer", () => {
  it.each([
    ["not the answer's shape", { kind: "draft", text: "x", events: [], extra: 1 }, "shape"],
    ["an empty text", draft([event("Gym", "2026-11-17T18:00", "2026-11-17T19:00")], { text: "  " }), "text_length"],
    ["a text answer with events", { ...draft([event("Gym", "2026-11-17T18:00", "2026-11-17T19:00")]), kind: "text" }, "text_with_events"],
    ["a draft with nothing in it", draft([]), "no_events"],
    ["more than 30 things", draft(Array.from({ length: 31 }, (_, i) => event(`S${i}`, "2026-11-17T18:00", "2026-11-17T19:00"))), "too_many_events"],
  ])("%s", (_case, raw, failure) => {
    expect(checkAnswerKeepingWhatFits(raw, context())).toEqual({ ok: false, failure });
  });
});

describe("leaveOut (the travel check in send_message)", () => {
  it("drops the new events not kept, names them, and keeps the answer as it was when all are kept", () => {
    const result = checkAnswerKeepingWhatFits(draft([event("Gym", "2026-11-17T18:00", "2026-11-17T19:00"), event("Swim", "2026-11-18T18:00", "2026-11-18T19:00")]), context());
    if (!result.ok || result.value.answer.kind !== "draft") throw new Error("expected a draft");
    const [gym, swim] = result.value.answer.proposals;
    expect(leaveOut(result.value, [gym, swim], "no_room_for_travel")).toBe(result.value);
    const left = leaveOut(result.value, [swim], "no_room_for_travel");
    expect(left.answer.kind === "draft" && left.answer.proposals).toEqual([swim]);
    expect(left.dropped.map((d) => [d.kind === "event" && d.title, d.reason])).toEqual([["Gym", "no_room_for_travel"]]);
    expect(leaveOut(result.value, [], "no_room_for_travel").answer.kind).toBe("text");
  });
});

describe("the note", () => {
  const gym: Dropped = { kind: "event", title: "Gym", startAt: new Date("2026-11-17T11:00:00Z"), endAt: new Date("2026-11-17T12:00:00Z"), reason: "overlaps_calendar" };

  it("no note when nothing was left out", () => {
    expect(withNote("Here is your week.", [], true, DISPLAY)).toBe("Here is your week.");
  });

  it("names what was left out and why, in the person's zone and format", () => {
    expect(withNote("Here is your week.", [gym], true, DISPLAY)).toBe(
      "Here is your week.\n\nLeft out of this plan because it did not fit:\n• Gym, Tue, Nov 17, 11:00 – 12:00: it clashes with an event in your calendar.",
    );
    expect(withNote("Here is your week.", [gym], true, { ...DISPLAY, timeFormat: "12h", timeZone: "Europe/Berlin" })).toContain("• Gym, Tue, Nov 17, 12 – 1pm:");
  });

  it("says when nothing could be planned, and names moves, deletes, to-dos and the hours", () => {
    const items: Dropped[] = [
      { kind: "move", title: "Call", startAt: new Date("2026-11-17T23:00:00Z"), endAt: new Date("2026-11-17T23:30:00Z"), reason: "outside_hours" },
      { kind: "delete", title: null, reason: "not_changeable" },
      { kind: "todos", title: "Call", reason: "todo_list_full" },
    ];
    expect(withNote("Sure.", items, false, DISPLAY)).toBe(
      [
        "Sure.",
        "",
        "None of this could go into a plan:",
        '• Moving "Call" to Tue, Nov 17, 23:00 – 23:30: it is outside your hours (7:00 – 22:00, see Settings).',
        "• Deleting an event: the coach may not change this event.",
        '• To-dos for "Call": an event has at most 20 to-dos.',
        "Try other days or times, or ask for less at once.",
      ].join("\n"),
    );
  });

  it(`shows at most ${NOTE_LINES} lines, then counts the rest`, () => {
    const note = withNote("x", Array.from({ length: NOTE_LINES + 3 }, () => gym), true, DISPLAY);
    expect(note.split("\n").filter((line) => line.startsWith("•"))).toHaveLength(NOTE_LINES);
    expect(note.endsWith("…and 3 more.")).toBe(true);
  });

  it("stays within 4,000 characters: the coach's text is shortened, the note stays whole", () => {
    const long = "a".repeat(MAX_TEXT);
    const note = withNote(long, [gym], true, DISPLAY);
    expect([...note].length).toBeLessThanOrEqual(MAX_TEXT);
    expect(note).toContain("…\n\nLeft out of this plan because it did not fit:\n• Gym");
    expect(withNote("a".repeat(100), [gym], true, DISPLAY).startsWith("a".repeat(100) + "\n\n")).toBe(true);
  });
});
