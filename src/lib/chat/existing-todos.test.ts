// Spec 23 in the coach's pure parts: which events take to-dos from the coach (decision 2), the checks of
// an answer that adds to-dos to events already in the calendar (R23 extended, decisions 1, 3 and 4),
// what Claude receives (the flag and the count, never the titles; earlier drafts in words), the answer
// format and the fixed prompt, and how the draft's day is drawn (decision 9).
import { describe, expect, it } from "vitest";
import { allowsTodos, AnswerShape, checkAnswer, checkDraft, type CheckContext, type TodoTarget } from "./checks";
import { addedTodosText, draftDaysOf, sketchDraft } from "./day-sketch";
import { buildAssistantInput } from "./input";
import { ANSWER_JSON_SCHEMA, SYSTEM_PROMPT } from "./prompt";
import { chatTotals } from "./totals";
import type { DraftTodosDto } from "./types";

const TZ = "Europe/Lisbon";
// Monday 16 November 2026, 21:30 in Lisbon (UTC+0 in winter).
const NOW = new Date("2026-11-16T21:30:00Z");

const LERNBLOCK: TodoTarget = {
  id: "ev-1",
  title: "Lernblock",
  allDay: false,
  startAt: new Date("2026-11-17T14:00:00Z"),
  endAt: new Date("2026-11-17T16:00:00Z"),
  firstDay: null,
  lastDay: null,
  todoCount: 0,
};
const EXAM: TodoTarget = { id: "ev-2", title: "Exam week", allDay: true, startAt: null, endAt: null, firstDay: "2026-11-16", lastDay: "2026-11-20", todoCount: 18 };

const context = (more: Partial<CheckContext> = {}): CheckContext => ({
  now: NOW,
  timeZone: TZ,
  goalIds: new Set(),
  calendar: [{ id: "ev-1", startAt: LERNBLOCK.startAt!, endAt: LERNBLOCK.endAt!, mayOverlap: false }],
  targets: new Map([
    ["e1", { id: "ev-1", updatedAt: "2026-11-10T00:00:00.000Z", title: "Lernblock", goalId: null, startAt: LERNBLOCK.startAt!, endAt: LERNBLOCK.endAt!, mayOverlap: false }],
    ["e2", null],
    ["e3", null],
  ]),
  todoTargets: new Map([
    ["e1", LERNBLOCK],
    ["e2", EXAM],
    ["e3", null],
  ]),
  ...more,
});

const answer = (addTodos: unknown[], changes: unknown[] = [], events: unknown[] = []) => ({ kind: "draft", text: "Added them.", events, changes, addTodos });

describe("which events take to-dos from the coach (decision 2)", () => {
  const timed = { source: "app", allDay: false, endAt: new Date("2026-11-17T16:00:00Z"), lastDay: null };

  it("the user's own events that are not from Outlook: also all-day events and events that have started", () => {
    expect(allowsTodos(timed, NOW, TZ)).toBe(true);
    expect(allowsTodos({ ...timed, source: "assistant" }, NOW, TZ)).toBe(true);
    expect(allowsTodos({ source: "app", allDay: true, endAt: null, lastDay: "2026-11-16" }, NOW, TZ)).toBe(true);
    // Started this morning, still today.
    expect(allowsTodos({ ...timed, endAt: new Date("2026-11-16T10:00:00Z") }, NOW, TZ)).toBe(true);
  });

  it("not Outlook events and not events that ended before today", () => {
    expect(allowsTodos({ ...timed, source: "outlook" }, NOW, TZ)).toBe(false);
    expect(allowsTodos({ ...timed, endAt: new Date("2026-11-15T23:00:00Z") }, NOW, TZ)).toBe(false);
    expect(allowsTodos({ source: "app", allDay: true, endAt: null, lastDay: "2026-11-15" }, NOW, TZ)).toBe(false);
  });
});

describe("checkAnswer with to-dos for existing events: accepted", () => {
  it("turns the reference back into the event and keeps the titles, trimmed and in order", () => {
    const result = checkAnswer(answer([{ ref: "e1", todos: [" Do the investment exercises ", "Watch the investment lecture"] }]), context());
    expect(result).toEqual({
      ok: true,
      value: {
        kind: "draft",
        text: "Added them.",
        proposals: [],
        changes: [],
        additions: [{ target: LERNBLOCK, todos: ["Do the investment exercises", "Watch the investment lecture"] }],
      },
    });
  });

  it("an all-day event; the list may reach exactly 20 (18 now + 2)", () => {
    expect(checkAnswer(answer([{ ref: "e2", todos: ["A", "B"] }]), context()).ok).toBe(true);
  });

  it("an event may be moved and get to-dos in one draft", () => {
    const result = checkAnswer(answer([{ ref: "e1", todos: ["A"] }], [{ ref: "e1", action: "move", start: "2026-11-17T17:00", end: "2026-11-17T19:00" }]), context());
    expect(result.ok && result.value.kind === "draft" && [result.value.changes.length, result.value.additions?.length]).toEqual([1, 1]);
  });

  it("1 title and 20 titles of 100 characters", () => {
    expect(checkAnswer(answer([{ ref: "e1", todos: ["x".repeat(100)] }]), context()).ok).toBe(true);
    expect(checkAnswer(answer([{ ref: "e1", todos: Array.from({ length: 20 }, (_, i) => `T${i}`) }]), context()).ok).toBe(true);
  });

  it("an answer without the field (the earlier format) has no additions", () => {
    const result = checkAnswer({ kind: "draft", text: "x", events: [{ title: "Run", start: "2026-11-17T18:00", end: "2026-11-17T19:00", goalId: null }], changes: [] }, context());
    expect(result.ok && result.value.kind === "draft" && result.value).not.toHaveProperty("additions");
  });
});

describe("checkAnswer with to-dos for existing events: rejected as a whole (R1)", () => {
  it.each([
    ["an unknown reference", answer([{ ref: "e9", todos: ["A"] }]), "unknown_ref"],
    ["an event that takes no to-dos (Outlook)", answer([{ ref: "e3", todos: ["A"] }]), "todos_not_allowed"],
    ["the same event twice", answer([{ ref: "e1", todos: ["A"] }, { ref: "e1", todos: ["B"] }]), "todos_twice"],
    ["an event the draft deletes", answer([{ ref: "e1", todos: ["A"] }], [{ ref: "e1", action: "delete", start: null, end: null }]), "todos_on_deleted"],
    ["no titles", answer([{ ref: "e1", todos: [] }]), "no_todos"],
    ["21 titles", answer([{ ref: "e1", todos: Array.from({ length: 21 }, (_, i) => `T${i}`) }]), "too_many_todos"],
    ["an empty title", answer([{ ref: "e1", todos: ["A", "  "] }]), "todo_title"],
    ["a title of 101 characters", answer([{ ref: "e1", todos: ["x".repeat(101)] }]), "todo_title"],
    ["a list that would be longer than 20 (18 now + 3)", answer([{ ref: "e2", todos: ["A", "B", "C"] }]), "todo_list_full"],
    ["a title that is not a text", answer([{ ref: "e1", todos: [5] }]), "shape"],
    ["an unknown field", answer([{ ref: "e1", todos: ["A"], done: true }]), "shape"],
  ])("%s", (_name, raw, failure) => {
    expect(checkAnswer(raw, context())).toEqual({ ok: false, failure });
  });

  it("a text answer that adds to-dos", () => {
    expect(checkAnswer({ kind: "text", text: "Sure.", events: [], changes: [], addTodos: [{ ref: "e1", todos: ["A"] }] }, context())).toEqual({
      ok: false,
      failure: "text_with_events",
    });
  });

  it("without the references for to-dos, none can be added", () => {
    expect(checkAnswer(answer([{ ref: "e1", todos: ["A"] }]), context({ todoTargets: undefined }))).toEqual({ ok: false, failure: "unknown_ref" });
  });

  it("each list of to-dos counts as one of the 30 things", () => {
    const events = Array.from({ length: 29 }, (_, i) => ({ title: `E${i}`, start: `2026-11-18T${String(i % 10).padStart(2, "0")}:00`, end: "2026-11-18T23:00", goalId: null }));
    // 29 + 1 = 30 is the limit; 29 + 2 is too many (checked before anything else).
    expect(checkAnswer(answer([{ ref: "e1", todos: ["A"] }, { ref: "e2", todos: ["B"] }], [], events), context())).toEqual({ ok: false, failure: "too_many_events" });
    expect(
      checkDraft([], [], context(), Array.from({ length: 31 }, (_, i) => ({ target: { ...LERNBLOCK, id: `ev-${i}` }, todos: ["A"] }))),
    ).toEqual({ ok: false, failure: "too_many_events" });
    expect(checkDraft([], [], context(), Array.from({ length: 30 }, (_, i) => ({ target: { ...LERNBLOCK, id: `ev-${i}` }, todos: ["A"] }))).ok).toBe(true);
  });

  it("accepting checks the count of now: a list that filled up since fails", () => {
    expect(checkDraft([], [], context(), [{ target: { ...LERNBLOCK, todoCount: 19 }, todos: ["A", "B"] }])).toEqual({ ok: false, failure: "todo_list_full" });
  });
});

describe("what Claude receives (R22, spec 23)", () => {
  const base = {
    now: NOW,
    timeZone: TZ,
    dayStartHour: 7,
    dayEndHour: 22,
    goals: [],
    totals: chatTotals({ doneEvents: [], sessions: [], goals: [] }, NOW, TZ),
    message: "For that one I also want the to-dos",
  };

  it("each event's count of to-dos (never the titles) and the flag when the coach may not add any", () => {
    const input = buildAssistantInput({
      ...base,
      history: [],
      calendar: [
        { allDay: false, title: "Lernblock", startAt: new Date("2026-11-17T14:00:00Z"), endAt: new Date("2026-11-17T16:00:00Z"), mayOverlap: false, ref: "e1", changeable: true, canAddTodos: true, todoCount: 2 },
        { allDay: false, title: "Team call", startAt: new Date("2026-11-17T10:00:00Z"), endAt: new Date("2026-11-17T11:00:00Z"), mayOverlap: false, ref: "e2", changeable: false, canAddTodos: false, todoCount: 0 },
        { allDay: true, title: "Exam week", firstDay: "2026-11-16", lastDay: "2026-11-20", mayOverlap: false, ref: "e3", changeable: false, canAddTodos: true, todoCount: 0 },
      ],
    });
    expect(input.events).toEqual([
      { ref: "e3", changeable: false, title: "Exam week", allDay: true, firstDay: "2026-11-16", lastDay: "2026-11-20", mayOverlap: false },
      { ref: "e2", changeable: false, canAddTodos: false, title: "Team call", allDay: false, start: "2026-11-17T10:00", end: "2026-11-17T11:00", mayOverlap: false },
      { ref: "e1", changeable: true, title: "Lernblock", allDay: false, start: "2026-11-17T14:00", end: "2026-11-17T16:00", mayOverlap: false, todoCount: 2 },
    ]);
  });

  it("an earlier draft carries its to-dos for existing events in words: the event's title and the to-dos", () => {
    const input = buildAssistantInput({
      ...base,
      calendar: [],
      history: [
        {
          role: "assistant",
          text: "Added them.",
          draft: { status: "open", events: [], changes: [], addedTodos: [{ title: "Lernblock", todos: ["Do the investment exercises"] }] },
        },
        { role: "assistant", text: "Here is Tuesday.", draft: { status: "rejected", events: [{ title: "Run", startAt: new Date("2026-11-17T18:00:00Z"), endAt: new Date("2026-11-17T19:00:00Z"), goalId: null }] } },
      ],
    });
    expect(input.history[0]).toMatchObject({ addedTodos: [{ title: "Lernblock", todos: ["Do the investment exercises"] }] });
    expect(input.history[1]).not.toHaveProperty("addedTodos");
    expect(JSON.stringify(input.history[0])).not.toContain("ev-");
  });
});

describe("the answer format and the prompt", () => {
  it("asks for a list of to-dos for existing events with the same fields our own check expects", () => {
    expect(ANSWER_JSON_SCHEMA.required).toContain("addTodos");
    expect(ANSWER_JSON_SCHEMA.properties.addTodos.items.required).toEqual(Object.keys(AnswerShape.shape.addTodos.unwrap().element.shape));
    expect(ANSWER_JSON_SCHEMA.properties.addTodos.items.properties.todos).toEqual({ type: "array", items: { type: "string" } });
  });

  it("allows to-dos for existing events only when asked, by reference, in the person's words, and says so in words otherwise", () => {
    for (const phrase of [
      "Adding to-dos to events already in the calendar (only when the person asks for it)",
      "naming the event only by its \"ref\"",
      "in the person's own words",
      "Never invent to-dos",
      "\"canAddTodos\": false",
      "\"todoCount\"",
      "must be at most 20",
      "say so in \"text\" instead",
      "An event you delete in \"changes\" gets no to-dos",
      "\"addedTodos\"",
      "cannot tick, rename or remove",
    ]) {
      expect(SYSTEM_PROMPT, phrase).toContain(phrase);
    }
  });
});

describe("the draft's day (decision 9)", () => {
  const added = (more: Partial<DraftTodosDto> = {}): DraftTodosDto => ({
    eventId: "ev-1",
    title: "Lernblock",
    allDay: false,
    startAt: "2026-11-17T14:00:00.000Z",
    endAt: "2026-11-17T16:00:00.000Z",
    firstDay: null,
    lastDay: null,
    todos: ["Exercises", "Lecture"],
    ...more,
  });

  it("the day of such an event is shown also when the draft has nothing else on it", () => {
    expect(draftDaysOf([], TZ, [], [added()])).toEqual(["2026-11-17"]);
    const [day] = sketchDraft([], [], TZ, [], undefined, [added()]);
    expect(day.withTodos.map((b) => [b.title, b.startTime, b.endTime, b.addedTodos])).toEqual([["Lernblock", "14:00", "16:00", ["Exercises", "Lecture"]]]);
    expect([day.startMin, day.endMin]).toEqual([13 * 60, 17 * 60]);
    expect(addedTodosText(2)).toBe("+2 to-dos");
    expect(addedTodosText(1)).toBe("+1 to-do");
  });

  it("the open draft draws the event as the calendar has it now and not twice", () => {
    const calendar = [
      {
        id: "ev-1",
        title: "Lernblock",
        allDay: false,
        startAt: "2026-11-17T15:00:00.000Z",
        endAt: "2026-11-17T17:00:00.000Z",
        firstDay: null,
        lastDay: null,
        mayOverlap: false,
        status: "planned" as const,
        goalId: null,
        seriesId: null,
        source: "app" as const,
        location: null,
        notSent: false,
        updatedAt: "2026-11-10T00:00:00.000Z",
      },
    ];
    const [day] = sketchDraft([], calendar, TZ, [], { startHour: 7, endHour: 21 }, [added()]);
    expect(day.withTodos.map((b) => b.startTime)).toEqual(["15:00"]);
    expect(day.existing).toEqual([]);
  });

  it("an all-day event is shown with the all-day chips on its first day; a non-open draft then has no column", () => {
    const allDay = added({ eventId: "ev-2", title: "Exam week", allDay: true, startAt: null, endAt: null, firstDay: "2026-11-18", lastDay: "2026-11-20", todos: ["Revise"] });
    const [day] = sketchDraft([], [], TZ, [], undefined, [allDay]);
    expect(day.date).toBe("2026-11-18");
    expect(day.allDayTodos).toEqual([{ title: "Exam week", addedTodos: ["Revise"] }]);
    expect([day.startMin, day.endMin, day.hours]).toEqual([0, 0, []]);
  });

  it("an event the draft also moves carries the mark on its moved block", () => {
    const move = {
      kind: "move" as const,
      eventId: "ev-1",
      title: "Lernblock",
      goalId: null,
      oldStartAt: "2026-11-17T14:00:00.000Z",
      oldEndAt: "2026-11-17T16:00:00.000Z",
      startAt: "2026-11-17T17:00:00.000Z",
      endAt: "2026-11-17T19:00:00.000Z",
    };
    const [day] = sketchDraft([], [], TZ, [move], undefined, [added()]);
    expect(day.moved.map((b) => b.addedTodos)).toEqual([["Exercises", "Lecture"]]);
    expect(day.withTodos).toEqual([]);
  });
});
