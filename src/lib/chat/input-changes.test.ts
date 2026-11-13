// Tests for what Claude receives about changes (spec 20, R22): each event's reference for this one
// request and whether the coach may change it, never an event's id; earlier drafts' changes in words.
import { describe, expect, it } from "vitest";
import { buildAssistantInput, type AssistantInputSource } from "./input";
import { chatTotals } from "./totals";

const NOW = new Date("2026-11-16T21:30:00Z"); // Monday evening in Lisbon

function source(change: Partial<AssistantInputSource> = {}): AssistantInputSource {
  return {
    now: NOW,
    timeZone: "Europe/Lisbon",
    dayStartHour: 7,
    dayEndHour: 22,
    history: [],
    goals: [],
    calendar: [],
    totals: chatTotals({ doneEvents: [], sessions: [], goals: [] }, NOW, "Europe/Lisbon"),
    message: "Move the lecture to the afternoon",
    ...change,
  };
}

describe("buildAssistantInput with references", () => {
  it("sends each event's reference and whether the coach may change it, and nothing else of the server's", () => {
    const calendar = [
      {
        allDay: false as const,
        title: "Lecture",
        startAt: new Date("2026-11-17T10:00:00Z"),
        endAt: new Date("2026-11-17T12:00:00Z"),
        mayOverlap: false,
        ref: "e1",
        changeable: true,
        // What only the server keeps: never sent.
        id: "6b1e3c9a-0000-4000-8000-000000000001",
        updatedAt: "2026-11-10T00:00:00.000Z",
        source: "app",
        seriesId: null,
        goalId: null,
      },
      { allDay: true as const, title: "Exam week", firstDay: "2026-11-23", lastDay: "2026-11-27", mayOverlap: false, ref: "e2", changeable: false },
    ];
    const input = buildAssistantInput(source({ calendar }));
    expect(input.events).toEqual([
      { ref: "e1", changeable: true, title: "Lecture", allDay: false, start: "2026-11-17T10:00", end: "2026-11-17T12:00", mayOverlap: false },
      { ref: "e2", changeable: false, title: "Exam week", allDay: true, firstDay: "2026-11-23", lastDay: "2026-11-27", mayOverlap: false },
    ]);
    const text = JSON.stringify(input);
    expect(text).not.toContain("6b1e3c9a");
    expect(text).not.toContain("2026-11-10T00:00");
    expect(text).not.toContain("source");
  });

  it("sends an earlier draft's changes in words: title, old time, new time; never an id", () => {
    const history = [
      {
        role: "assistant" as const,
        text: "Moved the lecture and dropped the gym.",
        draft: {
          status: "accepted" as const,
          events: [],
          changes: [
            {
              kind: "move" as const,
              title: "Lecture",
              oldStartAt: new Date("2026-11-17T10:00:00Z"),
              oldEndAt: new Date("2026-11-17T12:00:00Z"),
              startAt: new Date("2026-11-17T14:00:00Z"),
              endAt: new Date("2026-11-17T16:00:00Z"),
            },
            { kind: "delete" as const, title: "Gym", oldStartAt: new Date("2026-11-17T17:00:00Z"), oldEndAt: new Date("2026-11-17T18:00:00Z"), startAt: null, endAt: null },
          ],
        },
      },
    ];
    expect(buildAssistantInput(source({ history })).history).toEqual([
      {
        role: "assistant",
        text: "Moved the lecture and dropped the gym.",
        draftStatus: "accepted",
        proposedEvents: [],
        changes: [
          { change: "move", title: "Lecture", from: "2026-11-17T10:00", fromEnd: "2026-11-17T12:00", to: "2026-11-17T14:00", toEnd: "2026-11-17T16:00" },
          { change: "delete", title: "Gym", start: "2026-11-17T17:00", end: "2026-11-17T18:00" },
        ],
      },
    ]);
  });
});
