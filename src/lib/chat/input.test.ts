// Tests for what Claude receives (R22, spec 19): exactly these fields, nothing else.
import { describe, expect, it } from "vitest";
import { buildAssistantInput, type AssistantInputSource } from "./input";
import { chatTotals } from "./totals";

const NOW = new Date("2026-11-16T21:30:00Z"); // Monday evening in Lisbon
const GOAL = { id: "7f1d5c3e-1a2b-4c3d-8e9f-0a1b2c3d4e5f", title: "Statistics exam", deadline: "2027-01-20", rules: [{ kind: "hours" as const, target: 6, minMinutes: null }] };

function source(change: Partial<AssistantInputSource> = {}): AssistantInputSource {
  return {
    now: NOW,
    timeZone: "Europe/Lisbon",
    dayStartHour: 7,
    dayEndHour: 22,
    history: [],
    goals: [GOAL],
    calendar: [
      { allDay: false, title: "Lecture", startAt: new Date("2026-11-17T10:00:00Z"), endAt: new Date("2026-11-17T12:00:00Z"), mayOverlap: false },
      { allDay: true, title: "Exam week", firstDay: "2026-11-23", lastDay: "2026-11-27", mayOverlap: false },
      // Outside the 14 days: left out.
      { allDay: false, title: "Far away", startAt: new Date("2026-12-01T10:00:00Z"), endAt: new Date("2026-12-01T11:00:00Z"), mayOverlap: false },
      { allDay: true, title: "Last week", firstDay: "2026-11-09", lastDay: "2026-11-13", mayOverlap: false },
    ],
    totals: chatTotals({ doneEvents: [], sessions: [], goals: [] }, NOW, "Europe/Lisbon"),
    message: "Tomorrow I want to study 4 hours and watch football in the evening",
    ...change,
  };
}

describe("buildAssistantInput", () => {
  it("sends the local time, the day, the time zone, the visible hours and the last day for proposals", () => {
    const input = buildAssistantInput(source());
    expect(input).toMatchObject({
      now: "2026-11-16T21:30",
      today: "2026-11-16",
      weekday: "Monday",
      timeZone: "Europe/Lisbon",
      dayStartHour: 7,
      dayEndHour: 22,
      lastDayForProposals: "2026-11-30",
      message: "Tomorrow I want to study 4 hours and watch football in the evening",
    });
  });

  it("sends exactly these top-level fields", () => {
    expect(Object.keys(buildAssistantInput(source())).sort()).toEqual(
      ["dayEndHour", "dayStartHour", "events", "goals", "history", "lastDayForProposals", "message", "now", "timeZone", "today", "totals", "weekday"].sort(),
    );
  });

  it("sends goals with deadline and rules, and only the goal's id", () => {
    expect(buildAssistantInput(source()).goals).toEqual([
      { id: GOAL.id, title: "Statistics exam", deadline: "2027-01-20", rules: [{ kind: "hours", target: 6, minMinutes: null }] },
    ]);
  });

  it("sends the events from today to 14 days ahead with title, start, end, may_overlap and all_day only", () => {
    expect(buildAssistantInput(source()).events).toEqual([
      { title: "Lecture", allDay: false, start: "2026-11-17T10:00", end: "2026-11-17T12:00", mayOverlap: false },
      { title: "Exam week", allDay: true, firstDay: "2026-11-23", lastDay: "2026-11-27", mayOverlap: false },
    ]);
  });

  it("never copies anything else from an event, even when the row carries it (no id, location, goal, status)", () => {
    const leaky = {
      allDay: false as const,
      title: "Dentist",
      startAt: new Date("2026-11-18T10:00:00Z"),
      endAt: new Date("2026-11-18T11:00:00Z"),
      mayOverlap: false,
      id: "e1",
      location: "Rua Augusta 1, Lisbon",
      goalId: GOAL.id,
      status: "planned",
    };
    const text = JSON.stringify(buildAssistantInput(source({ calendar: [leaky] })));
    expect(text).not.toContain("Rua Augusta");
    expect(text).not.toContain('"e1"');
    expect(Object.keys(buildAssistantInput(source({ calendar: [leaky] })).events[0]).sort()).toEqual(["allDay", "end", "mayOverlap", "start", "title"]);
  });

  it("sends the last 10 messages, an assistant message with its draft's proposed events in local time", () => {
    const history = Array.from({ length: 12 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", text: `m${i}`, draft: null }));
    history[11] = {
      role: "assistant",
      text: "Here is Tuesday",
      draft: {
        status: "open",
        events: [{ title: "Study", startAt: new Date("2026-11-17T08:00:00Z"), endAt: new Date("2026-11-17T12:00:00Z"), goalId: GOAL.id }],
      },
    } as never;
    const sent = buildAssistantInput(source({ history })).history;
    expect(sent).toHaveLength(10);
    expect(sent[0]).toEqual({ role: "user", text: "m2" });
    expect(sent[9]).toEqual({
      role: "assistant",
      text: "Here is Tuesday",
      draftStatus: "open",
      proposedEvents: [{ title: "Study", start: "2026-11-17T08:00", end: "2026-11-17T12:00", goalId: GOAL.id }],
    });
  });

  it("contains no email, password, location, block list, payment data or task", () => {
    const text = JSON.stringify(buildAssistantInput(source())).toLowerCase();
    for (const word of ["email", "password", "location", "blocked", "stripe", "plan\"", "task", "@"]) {
      expect(text, word).not.toContain(word);
    }
  });
});
