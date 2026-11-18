// Placement of shared calendars on the viewer's screen (spec 53, from spec 29): the window asked for, blocks in the
// viewer's time zone cut at midnight with lanes of their own, all-day events per day, the choice of at
// most three people (R58), and the sentences of the People page.
import { describe, expect, it } from "vitest";
import { keepChosen, placeShared, sharedAllDayByDay, toggleChosen, windowOf, type ShownCalendar } from "./place";
import { sharedWithYouText, type SharingPerson } from "./types";

const ANA: SharingPerson = { userId: "a", name: "Ana", photoUrl: null, calendar: "busy", focus: false };
const BEN: SharingPerson = { userId: "b", name: "Ben", photoUrl: null, calendar: "details", focus: true };
const CARL: SharingPerson = { userId: "c", name: "Carl", photoUrl: null, calendar: "busy", focus: false };
const DORA: SharingPerson = { userId: "d", name: "Dora", photoUrl: null, calendar: "details", focus: false };
const EVA: SharingPerson = { userId: "e", name: "Eva", photoUrl: null, calendar: "none", focus: true };

describe("windowOf", () => {
  it("runs from the first shown day's midnight to the midnight after the last, in the viewer's zone", () => {
    expect(windowOf(["2026-11-16", "2026-11-22"], "America/New_York")).toEqual({ from: "2026-11-16T05:00:00.000Z", to: "2026-11-23T05:00:00.000Z" });
  });
});

describe("placeShared", () => {
  const calendars: ShownCalendar[] = [
    {
      person: ANA,
      level: "busy",
      events: [
        { allDay: false, startAt: "2026-11-16T09:00:00.000Z", endAt: "2026-11-16T11:00:00.000Z" },
        { allDay: false, startAt: "2026-11-16T22:00:00.000Z", endAt: "2026-11-17T01:00:00.000Z" },
        { allDay: true, firstDay: "2026-11-16", lastDay: "2026-11-17" },
      ],
    },
    { person: BEN, level: "details", events: [{ allDay: false, startAt: "2026-11-16T10:00:00.000Z", endAt: "2026-11-16T10:30:00.000Z", title: "Call", location: null }] },
  ];

  it("places blocks in the viewer's zone, cuts at midnight, and gives overlapping ones lanes", () => {
    const [mon, tue] = placeShared(calendars, ["2026-11-16", "2026-11-17"], "Europe/Lisbon");
    expect(mon.map((b) => [b.person.name, b.startMin, b.endMin, b.lane, b.lanes, b.continuesAfter, b.title])).toEqual([
      ["Ana", 540, 660, 0, 2, false, null],
      ["Ben", 600, 630, 1, 2, false, "Call"],
      ["Ana", 1320, 1440, 0, 1, true, null],
    ]);
    expect(tue.map((b) => [b.startMin, b.endMin, b.continuesBefore])).toEqual([[0, 60, true]]);
  });

  it("follows the viewer's zone, not UTC", () => {
    const [mon] = placeShared(calendars.slice(1), ["2026-11-16"], "America/New_York");
    expect(mon.map((b) => [b.startMin, b.endMin])).toEqual([[300, 330]]);
  });

  it("lists all-day events on each day they cover", () => {
    const days = sharedAllDayByDay(calendars, ["2026-11-16", "2026-11-17", "2026-11-18"]);
    expect(days.map((d) => d.length)).toEqual([1, 1, 0]);
  });
});

describe("choosing whom to show (R58)", () => {
  const people = [ANA, BEN, CARL, DORA, EVA];

  it("keeps only people who share their calendar, once each, at most three, in the order chosen", () => {
    expect(keepChosen(["b", "x", 4, "e", "b", "a", "c", "d"], people)).toEqual(["b", "a", "c"]);
  });

  it("turns a person on and off, and refuses a fourth", () => {
    expect(toggleChosen(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleChosen(["a", "b"], "a")).toEqual(["b"]);
    expect(toggleChosen(["a", "b", "c"], "d")).toEqual(["a", "b", "c"]);
  });
});

describe("sharedWithYouText", () => {
  it("says what a contact shares, or nothing (the focus flag is never shown, spec 53)", () => {
    expect(sharedWithYouText({ calendar: "details", focus: true })).toBe("Shares their calendar (details) with you");
    expect(sharedWithYouText({ calendar: "busy", focus: false })).toBe("Shares their calendar (free/busy) with you");
    expect(sharedWithYouText({ calendar: "none", focus: true })).toBeNull();
    expect(sharedWithYouText({ calendar: "none", focus: false })).toBeNull();
  });
});
