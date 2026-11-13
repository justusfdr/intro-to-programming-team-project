// Spec 21 in the coach's pure parts: a new event of an answer may carry to-dos (0 to 20 titles, each 1
// to 100 characters after trimming; one failure rejects the whole answer, R23), the answer format and
// the fixed prompt say so, and an earlier draft's to-dos go to Claude with the history (R22) while the
// calendar's own events never carry to-dos.
import { describe, expect, it } from "vitest";
import { checkAnswer, AnswerShape, type CheckContext } from "./checks";
import { buildAssistantInput } from "./input";
import { ANSWER_JSON_SCHEMA, SYSTEM_PROMPT } from "./prompt";
import { chatTotals } from "./totals";

// Monday 16 November 2026, 21:30 in Lisbon (UTC+0 in winter).
const NOW = new Date("2026-11-16T21:30:00Z");
const context: CheckContext = { now: NOW, timeZone: "Europe/Lisbon", goalIds: new Set(), calendar: [] };

const study = (todos?: unknown) => ({
  title: "Study",
  start: "2026-11-17T12:00",
  end: "2026-11-17T13:00",
  goalId: null,
  ...(todos === undefined ? {} : { todos }),
});
const answer = (...events: unknown[]) => ({ kind: "draft", text: "Here is Tuesday.", events, changes: [] });

describe("checkAnswer with to-dos", () => {
  it("keeps an event's to-dos, trimmed and in order", () => {
    const result = checkAnswer(answer(study([" Read chapter 3 ", "Exercises 1-4"])), context);
    expect(result.ok && result.value.kind === "draft" && result.value.proposals[0].todos).toEqual(["Read chapter 3", "Exercises 1-4"]);
  });

  it("an event without to-dos, or with an empty list, has none (the field is left out)", () => {
    for (const todos of [undefined, []]) {
      const result = checkAnswer(answer(study(todos)), context);
      expect(result.ok && result.value.kind === "draft" && result.value.proposals[0]).not.toHaveProperty("todos");
    }
  });

  it("accepts 20 to-dos and titles of 100 characters", () => {
    const twenty = Array.from({ length: 20 }, (_, i) => `To-do ${i + 1}`);
    expect(checkAnswer(answer(study(twenty)), context).ok).toBe(true);
    expect(checkAnswer(answer(study(["x".repeat(100)])), context).ok).toBe(true);
  });

  it("rejects the whole answer for 21 to-dos, an empty or 101-character title, or a to-do that is not a text", () => {
    const twentyOne = Array.from({ length: 21 }, (_, i) => `To-do ${i + 1}`);
    const other = { ...study(["Fine"]), title: "Call", start: "2026-11-17T14:00", end: "2026-11-17T14:30" };
    expect(checkAnswer(answer(other, study(twentyOne)), context)).toEqual({ ok: false, failure: "too_many_todos" });
    expect(checkAnswer(answer(other, study(["Fine", "  "])), context)).toEqual({ ok: false, failure: "todo_title" });
    expect(checkAnswer(answer(other, study(["x".repeat(101)])), context)).toEqual({ ok: false, failure: "todo_title" });
    expect(checkAnswer(answer(other, study([5])), context)).toEqual({ ok: false, failure: "shape" });
    expect(checkAnswer(answer(other, study("Read")), context)).toEqual({ ok: false, failure: "shape" });
  });
});

describe("the answer format and the prompt", () => {
  it("asks for each new event's to-dos as a list of texts", () => {
    expect(ANSWER_JSON_SCHEMA.properties.events.items.required).toContain("todos");
    expect(ANSWER_JSON_SCHEMA.properties.events.items.properties.todos).toEqual({ type: "array", items: { type: "string" } });
    expect(Object.keys(AnswerShape.shape.events.element.shape)).toContain("todos");
  });

  it("tells the coach to write down the to-dos the person lists, in their words, and never to invent any", () => {
    for (const phrase of ["\"todos\"", "in the person's own words", "Do not invent to-dos", "At most 20 to-dos per event", "events already in the calendar"]) {
      expect(SYSTEM_PROMPT, phrase).toContain(phrase);
    }
  });
});

describe("what Claude receives (R22)", () => {
  const base = {
    now: NOW,
    timeZone: "Europe/Lisbon",
    dayStartHour: 7,
    dayEndHour: 22,
    goals: [],
    totals: chatTotals({ doneEvents: [], sessions: [], goals: [] }, NOW, "Europe/Lisbon"),
    message: "Add one more: the summary",
  };

  it("an earlier draft's new events carry their to-dos; an event without has no field", () => {
    const input = buildAssistantInput({
      ...base,
      calendar: [],
      history: [
        {
          role: "assistant",
          text: "Here is Tuesday.",
          draft: {
            status: "open",
            events: [
              { title: "Study", startAt: new Date("2026-11-17T12:00:00Z"), endAt: new Date("2026-11-17T13:00:00Z"), goalId: null, todos: ["Read chapter 3"] },
              { title: "Call", startAt: new Date("2026-11-17T14:00:00Z"), endAt: new Date("2026-11-17T14:30:00Z"), goalId: null },
            ],
          },
        },
      ],
    });
    expect(input.history[0]).toMatchObject({
      proposedEvents: [
        { title: "Study", start: "2026-11-17T12:00", end: "2026-11-17T13:00", goalId: null, todos: ["Read chapter 3"] },
        { title: "Call", start: "2026-11-17T14:00", end: "2026-11-17T14:30", goalId: null },
      ],
    });
    expect((input.history[0] as { proposedEvents: object[] }).proposedEvents[1]).not.toHaveProperty("todos");
  });

  it("the calendar's own events never carry to-dos", () => {
    const input = buildAssistantInput({
      ...base,
      history: [],
      calendar: [
        // Even if a caller handed more in, only the allowed fields are copied.
        { allDay: false, title: "Lecture", startAt: new Date("2026-11-17T10:00:00Z"), endAt: new Date("2026-11-17T11:00:00Z"), mayOverlap: false, todos: ["Secret"] } as never,
      ],
    });
    expect(JSON.stringify(input.events)).not.toContain("todos");
    expect(JSON.stringify(input.events)).not.toContain("Secret");
  });
});
