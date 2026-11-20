// Issue #227: new and moved events must not fall into the way to an existing event ("Leave" block).
import { describe, expect, it } from "vitest";
import { checkAnswer, type CheckContext, type TravelWindow } from "./checks";

const NOW = new Date("2026-11-16T09:00:00Z");
const LECTURE = "11111111-1111-4111-8111-111111111111";
// The lecture starts Tuesday 10:00; leaving for it at 09:25 (25 minutes by car plus 10 buffer).
const WAY: TravelWindow = { id: LECTURE, startAt: new Date("2026-11-17T09:25:00Z"), endAt: new Date("2026-11-17T10:00:00Z") };

const context = (change: Partial<CheckContext> = {}): CheckContext => ({
  now: NOW,
  timeZone: "Europe/Lisbon",
  goalIds: new Set(),
  calendar: [{ id: LECTURE, startAt: new Date("2026-11-17T10:00:00Z"), endAt: new Date("2026-11-17T11:00:00Z"), mayOverlap: false }],
  travel: [WAY],
  ...change,
});

const draft = (start: string, end: string) => ({ kind: "draft", text: "Here.", events: [{ title: "Study", start, end, goalId: null }] });

describe("checkAnswer with the way to an event (issue 227)", () => {
  it("refuses a session that starts while the person is on the way", () => {
    expect(checkAnswer(draft("2026-11-17T09:00", "2026-11-17T09:30"), context())).toEqual({ ok: false, failure: "overlaps_travel" });
    expect(checkAnswer(draft("2026-11-17T09:30", "2026-11-17T09:45"), context())).toEqual({ ok: false, failure: "overlaps_travel" });
  });

  it("accepts a session that ends exactly when the way starts", () => {
    expect(checkAnswer(draft("2026-11-17T08:25", "2026-11-17T09:25"), context()).ok).toBe(true);
  });

  it("without the way (nothing known) nothing changes", () => {
    expect(checkAnswer(draft("2026-11-17T09:00", "2026-11-17T09:30"), context({ travel: undefined })).ok).toBe(true);
  });

  it("an event the draft moves stops blocking at its old time", () => {
    const targets = new Map([["e1", { id: LECTURE, updatedAt: "x", title: "Lecture", goalId: null, startAt: new Date("2026-11-17T10:00:00Z"), endAt: new Date("2026-11-17T11:00:00Z"), mayOverlap: false }]]);
    const answer = {
      kind: "draft",
      text: "Moved.",
      events: [{ title: "Study", start: "2026-11-17T09:30", end: "2026-11-17T09:45", goalId: null }],
      changes: [{ ref: "e1", action: "move", start: "2026-11-17T15:00", end: "2026-11-17T16:00" }],
    };
    expect(checkAnswer(answer, context({ targets })).ok).toBe(true);
  });

  it("a moved event may not land in the way to another event", () => {
    const other = "22222222-2222-4222-8222-222222222222";
    const targets = new Map([["e1", { id: other, updatedAt: "x", title: "Call", goalId: null, startAt: new Date("2026-11-17T14:00:00Z"), endAt: new Date("2026-11-17T14:30:00Z"), mayOverlap: false }]]);
    const answer = { kind: "draft", text: "Moved.", events: [], changes: [{ ref: "e1", action: "move", start: "2026-11-17T09:30", end: "2026-11-17T09:50" }] };
    expect(checkAnswer(answer, context({ targets }))).toEqual({ ok: false, failure: "overlaps_travel" });
  });
});
