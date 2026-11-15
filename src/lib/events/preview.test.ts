// The event preview's pure parts (spec 35): what a click means, the date-and-time line, the place, the
// guests, and what the panel shows for each kind of event.
import { describe, expect, it } from "vitest";
import type { AllDayEvent, WeekEvent } from "./types";
import { clickIntent, DOUBLE_CLICK_WAIT_MS, guestRows, previewDelay, ownPreview, placeOf, todoProgress, wantsMap, whenSentence, type GuestPerson } from "./preview";

function timed(fields: Partial<WeekEvent> = {}): WeekEvent {
  return {
    id: "e1",
    title: "Statistics exam",
    allDay: false,
    startAt: "2026-11-14T14:30:00.000Z",
    endAt: "2026-11-14T15:45:00.000Z",
    firstDay: null,
    lastDay: null,
    mayOverlap: false,
    status: "planned",
    goalId: null,
    seriesId: null,
    source: "app",
    location: null,
    notSent: false,
    updatedAt: "2026-11-10T10:00:00.000Z",
    conflict: false,
    startTime: "14:30",
    endTime: "15:45",
    endDay: null,
    startLocal: "2026-11-14T14:30",
    endLocal: "2026-11-14T15:45",
    ...fields,
  };
}

function allDay(firstDay: string, lastDay: string, fields: Partial<AllDayEvent> = {}): AllDayEvent {
  return { id: "a1", title: "Exam week", allDay: true, firstDay, lastDay, mayOverlap: false, status: "planned", goalId: null, seriesId: null, source: "app", location: null, notSent: false, updatedAt: "2026-11-10T10:00:00.000Z", ...fields };
}

const LEA: GuestPerson = { userId: "u-lea", name: "Lea Sousa", photoUrl: null };

describe("clickIntent: click, double-click, drag", () => {
  it("one click opens the preview, the second click of a double-click the editor", () => {
    expect(clickIntent(1, false)).toBe("preview");
    expect(clickIntent(2, false)).toBe("editor");
    expect(clickIntent(3, false)).toBe("editor");
  });

  it("the click that ends a drag or a resize does nothing", () => {
    expect(clickIntent(1, true)).toBe("ignore");
    expect(clickIntent(2, true)).toBe("ignore");
  });

  it("a keyboard click (detail 0) always opens the preview, also right after a drag", () => {
    expect(clickIntent(0, false)).toBe("preview");
    expect(clickIntent(0, true)).toBe("preview");
  });
});

describe("previewDelay", () => {
  it("a mouse click on a closed panel waits for a possible second click", () => {
    expect(previewDelay({ panelOpen: false, byKeyboard: false })).toBe(DOUBLE_CLICK_WAIT_MS);
    expect(DOUBLE_CLICK_WAIT_MS).toBeLessThanOrEqual(300);
  });

  it("the keyboard, and switching an open panel, open at once", () => {
    expect(previewDelay({ panelOpen: false, byKeyboard: true })).toBe(0);
    expect(previewDelay({ panelOpen: true, byKeyboard: false })).toBe(0);
  });
});

describe("whenSentence", () => {
  it("a timed event on one day, in 24-hour and 12-hour form", () => {
    const when = { allDay: false as const, startLocal: "2026-11-14T14:30", endLocal: "2026-11-14T15:45" };
    expect(whenSentence(when, "24h")).toBe("Sat, Nov 14 · 14:30 to 15:45");
    expect(whenSentence(when, "12h")).toBe("Sat, Nov 14 · 2:30pm to 3:45pm");
  });

  it("a timed event past midnight names both days", () => {
    expect(whenSentence({ allDay: false, startLocal: "2026-11-14T23:00", endLocal: "2026-11-15T01:30" }, "24h")).toBe("Sat, Nov 14 · 23:00 to Sun, Nov 15 · 1:30");
    expect(whenSentence({ allDay: false, startLocal: "2026-11-14T23:00", endLocal: "2026-11-15T00:00" }, "12h")).toBe("Sat, Nov 14 · 11pm to Sun, Nov 15 · 12am");
  });

  it("all day on one day and over several days", () => {
    expect(whenSentence({ allDay: true, firstDay: "2026-11-14", lastDay: "2026-11-14" }, "24h")).toBe("Sat, Nov 14 · all day");
    expect(whenSentence({ allDay: true, firstDay: "2026-11-14", lastDay: "2026-11-16" }, "12h")).toBe("Sat, Nov 14 to Mon, Nov 16 · all day");
    expect(whenSentence({ allDay: true, firstDay: "2026-12-30", lastDay: "2027-01-02" }, "24h")).toBe("Wed, Dec 30 to Sat, Jan 2 · all day");
  });
});

describe("placeOf", () => {
  it("nothing for an empty place", () => {
    expect(placeOf(null)).toEqual({ kind: "none" });
    expect(placeOf("   ")).toEqual({ kind: "none" });
  });

  it("an address for the map", () => {
    expect(placeOf(" Nova SBE, Carcavelos ")).toEqual({ kind: "address", text: "Nova SBE, Carcavelos" });
    expect(placeOf("Room 2.01")).toEqual({ kind: "address", text: "Room 2.01" });
  });

  it("a link only for a whole https address without a user name", () => {
    expect(placeOf("https://teams.microsoft.com/l/meetup")).toEqual({ kind: "link", href: "https://teams.microsoft.com/l/meetup", text: "https://teams.microsoft.com/l/meetup" });
  });

  it("text only (no link, no map) for any other web address", () => {
    for (const text of ["http://zoom.us/j/1", "www.zoom.us/j/123", "javascript://x%0Aalert(1)", "Join: https://meet.google.com/abc", "https://user:pw@example.com"]) {
      expect(placeOf(text), text).toEqual({ kind: "text", text });
    }
  });
});

describe("guestRows", () => {
  it("a contact as the person, anyone else as the address, each once and in lower case", () => {
    expect(guestRows({ source: "app", guests: ["lea@example.com", "x@example.com", "LEA@example.com"] }, { "lea@example.com": LEA })).toEqual([
      { address: "lea@example.com", person: LEA, organizer: false },
      { address: "x@example.com", person: null, organizer: false },
    ]);
  });

  it("an Outlook event's organizer first and marked", () => {
    expect(guestRows({ source: "outlook", organizer: "Boss@example.com", guests: ["me@example.com", "boss@example.com"] }, {})).toEqual([
      { address: "boss@example.com", person: null, organizer: true },
      { address: "me@example.com", person: null, organizer: false },
    ]);
  });

  it("no rows without guests; an organizer of an event that is not from Outlook is not shown", () => {
    expect(guestRows({ source: "app" }, {})).toEqual([]);
    expect(guestRows({ source: "app", organizer: "x@example.com" }, {})).toEqual([]);
  });

  it("never takes an inherited key for a person", () => {
    expect(guestRows({ source: "app", guests: ["constructor"] }, {})).toEqual([{ address: "constructor", person: null, organizer: false }]);
  });
});

describe("todoProgress", () => {
  it("says how many are done", () => {
    expect(todoProgress(2, 4)).toBe("2 of 4 to-dos done");
    expect(todoProgress(0, 1)).toBe("0 of 1 to-do done");
  });
});

describe("ownPreview: what the panel shows for each kind of event", () => {
  const goals = [{ id: "g1", title: "Pass statistics", color: "teal" }];

  it("a plain timed event: title and time only; every other part empty", () => {
    expect(ownPreview(timed(), goals, {}, "24h")).toEqual({
      goal: null,
      title: "Statistics exam",
      when: "Sat, Nov 14 · 14:30 to 15:45",
      repeats: false,
      guests: [],
      todos: null,
      notes: null,
      place: { kind: "none" },
      canEdit: true,
    });
  });

  it("an event with everything: goal, series, guests, to-dos, notes and an address", () => {
    const event = timed({
      goalId: "g1",
      seriesId: "s1",
      guests: ["lea@example.com", "x@example.com"],
      todoCount: 4,
      todosDone: 2,
      notes: "Bring the calculator\nand a pen",
      location: "Nova SBE, Carcavelos",
    });
    const view = ownPreview(event, goals, { "lea@example.com": LEA }, "12h");
    expect(view.goal).toEqual({ title: "Pass statistics", color: "teal" });
    expect(view.repeats).toBe(true);
    expect(view.guests.map((g) => g.person?.name ?? g.address)).toEqual(["Lea Sousa", "x@example.com"]);
    expect(view.todos).toEqual({ done: 2, total: 4 });
    expect(view.notes).toBe("Bring the calculator\nand a pen");
    expect(view.place).toEqual({ kind: "address", text: "Nova SBE, Carcavelos" });
    expect(wantsMap(event)).toBe(true);
  });

  it("an Outlook event with an organizer and an online meeting: organizer marked, a link, no map", () => {
    const event = timed({ source: "outlook", organizer: "boss@example.com", guests: ["me@example.com"], location: "https://teams.microsoft.com/l/x" });
    const view = ownPreview(event, goals, {}, "24h");
    expect(view.guests[0]).toEqual({ address: "boss@example.com", person: null, organizer: true });
    expect(view.place.kind).toBe("link");
    expect(wantsMap(event)).toBe(false);
  });

  it("an all-day event over several days with a goal that is gone and blank notes", () => {
    const view = ownPreview(allDay("2026-11-14", "2026-11-16", { goalId: "deleted", notes: "  " }), goals, {}, "24h");
    expect(view.when).toBe("Sat, Nov 14 to Mon, Nov 16 · all day");
    expect(view.goal).toBeNull();
    expect(view.notes).toBeNull();
    expect(view.todos).toBeNull();
  });
});
