// The browser's side of a shared calendar (spec 53, from spec 29): an answer is kept only in the shape of
// the server's allow-list (R57, E11: no ids, no notes, no guests, nothing else), "busy" never carries a
// title, and the remembered choice is per signed-in user (E15).
import { afterEach, describe, expect, it, vi } from "vitest";
import { SHARED_CALENDAR_KEYS, SHARED_EVENT_KEYS } from "@/lib/shares/types";
import { asAnswer, rememberShown, shownCalendarsKey } from "./useSharedCalendars";

const keysOf = (value: object) => Object.keys(value);

describe("asAnswer", () => {
  it("keeps only the allowed keys of a details answer and drops anything else", () => {
    const answer = asAnswer({
      level: "details",
      owner: "someone",
      events: [
        { allDay: false, startAt: "2026-11-17T09:00:00.000Z", endAt: "2026-11-17T10:00:00.000Z", title: "Exam", location: "Room 1", id: "x", notes: "secret", guests: ["a@b.c"] },
        { allDay: true, firstDay: "2026-11-18", lastDay: "2026-11-18", title: "Trip", location: null, user_id: "u" },
      ],
    });
    expect(answer).not.toBeNull();
    expect(keysOf(answer!).sort()).toEqual([...SHARED_CALENDAR_KEYS].sort());
    for (const event of answer!.events) for (const key of keysOf(event)) expect(SHARED_EVENT_KEYS).toContain(key);
    expect(JSON.stringify(answer)).not.toMatch(/secret|a@b\.c|"x"|"u"|someone/);
  });

  it("never keeps a title or place at busy, even when one is sent", () => {
    const answer = asAnswer({ level: "busy", events: [{ allDay: false, startAt: "2026-11-17T09:00:00.000Z", endAt: "2026-11-17T10:00:00.000Z", title: "Exam", location: "Room 1" }] });
    expect(answer?.events).toEqual([{ allDay: false, startAt: "2026-11-17T09:00:00.000Z", endAt: "2026-11-17T10:00:00.000Z" }]);
  });

  it("counts anything of another shape as nothing", () => {
    expect(asAnswer(null)).toBeNull();
    expect(asAnswer({ level: "none", events: [] })).toBeNull();
    expect(asAnswer({ level: "busy", events: "x" })).toBeNull();
    expect(asAnswer({ level: "busy", events: [{ allDay: false, startAt: 1 }] })?.events).toEqual([]);
  });
});

describe("E15: the remembered choice", () => {
  it("is kept under a key of the signed-in user's own", () => {
    expect(shownCalendarsKey("u1")).toBe("lockedin.shownCalendars:u1");
    expect(shownCalendarsKey("u1")).not.toBe(shownCalendarsKey("u2"));
  });
});

describe("rememberShown (R58)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds a person while there is room and answers false, adding nobody, when three are shown", () => {
    const saved = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => void saved.set(k, v) },
      dispatchEvent: () => true,
    });
    for (const id of ["a", "b", "c"]) expect(rememberShown("viewer-r58", id)).toBe(true);
    expect(rememberShown("viewer-r58", "a")).toBe(true);
    expect(rememberShown("viewer-r58", "d")).toBe(false);
    expect(JSON.parse(saved.get(shownCalendarsKey("viewer-r58"))!)).toEqual(["a", "b", "c"]);
  });
});
