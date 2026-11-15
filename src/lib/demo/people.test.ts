// The demo contacts' pure parts (spec 32): who they are, which ids count, and the calendars and focus
// charts generated for them. Same input, same output (no randomness); each block at its local time in
// the person's own time zone, also across a clock change; the shapes of a real share (R48, R49).
import { describe, expect, it } from "vitest";
import { initialsOf } from "@/lib/profiles/display-name";
import { isLinkedInUrl } from "@/lib/profiles/linkedin";
import { FOCUS_DAY_KEYS, FOCUS_WEEK_KEYS, SHARED_EVENT_KEYS } from "@/lib/shares/types";
import { localDateTimeOf } from "@/lib/time/zoned";
import { DEMO_IDS, DEMO_PEOPLE, demoCalendar, demoFocus, demoPerson, demoSharingPeople, demoWeekEvents, isDemoId } from "./people";

const lea = demoPerson("demo-lea")!;
const jonas = demoPerson("demo-jonas")!;
const maya = demoPerson("demo-maya")!;

const at = (iso: string) => new Date(iso);
/** The events' local start and end in the person's zone, "2026-11-16T09:00–10:30 Title". */
const local = (events: { startAt: Date | string; endAt: Date | string; title?: string }[], zone: string) =>
  events.map((e) => `${localDateTimeOf(new Date(e.startAt), zone)}–${localDateTimeOf(new Date(e.endAt), zone).slice(11)}${e.title ? ` ${e.title}` : ""}`);

describe("who the demo contacts are", () => {
  it("three people with fixed ids, in Lisbon, Berlin and New York", () => {
    expect(DEMO_PEOPLE.map((p) => p.id)).toEqual([...DEMO_IDS]);
    expect(DEMO_PEOPLE.map((p) => p.timeZone)).toEqual(["Europe/Lisbon", "Europe/Berlin", "America/New_York"]);
  });

  it("each shares something different: details and the chart, free/busy only, nothing", () => {
    expect(DEMO_PEOPLE.map((p) => p.shares)).toEqual([
      { calendar: "details", focus: true },
      { calendar: "busy", focus: false },
      { calendar: "none", focus: false },
    ]);
  });

  it("their LinkedIn links have the stored form and are clearly not a real person; initials match the names", () => {
    for (const person of DEMO_PEOPLE) {
      expect(isLinkedInUrl(person.linkedinUrl)).toBe(true);
      expect(person.linkedinUrl).toBe(`https://www.linkedin.com/in/lockedin-${person.id}`);
      expect(person.look.initials).toBe(initialsOf(person.name));
      expect(person.look.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("only the three exact ids are demo ids", () => {
    for (const id of DEMO_IDS) expect(isDemoId(id)).toBe(true);
    for (const id of ["Demo-Lea", "DEMO-LEA", " demo-lea", "demo-lea ", "demo-", "demo-lea2", "00000000-0000-4000-8000-000000000000", "", null, 7]) {
      expect(isDemoId(id), String(id)).toBe(false);
    }
    expect(demoPerson("demo-anna")).toBeNull();
  });

  it("the calendar and analytics pages list only those who share something, marked as demo", () => {
    expect(demoSharingPeople()).toEqual([
      { userId: "demo-lea", name: "Lea Sousa", photoUrl: null, calendar: "details", focus: true, demo: lea.look },
      { userId: "demo-jonas", name: "Jonas Becker", photoUrl: null, calendar: "busy", focus: false, demo: jonas.look },
    ]);
  });
});

describe("generated calendars", () => {
  const WEEK = [at("2026-11-16T00:00:00Z"), at("2026-11-23T00:00:00Z")] as const;

  it("the same week in gives the same events out, and every week looks the same on the wall clock", () => {
    const first = demoCalendar(lea, ...WEEK);
    expect(demoCalendar(lea, ...WEEK)).toEqual(first);
    const next = demoCalendar(lea, at("2026-11-23T00:00:00Z"), at("2026-11-30T00:00:00Z"))!;
    const shift = (iso: string) => new Date(Date.parse(iso) - 7 * 24 * 3600 * 1000).toISOString();
    expect(next.events.map((e) => ({ ...e, startAt: shift((e as { startAt: string }).startAt), endAt: shift((e as { endAt: string }).endAt) }))).toEqual(first!.events);
  });

  it("places each block at its local time in the person's own zone", () => {
    expect(local(demoWeekEvents(lea, ...WEEK), "Europe/Lisbon").slice(0, 2)).toEqual([
      "2026-11-16T07:30–08:15 Morning run",
      "2026-11-16T09:00–10:30 Statistics lecture",
    ]);
    // Lisbon is on UTC in November, Berlin one hour ahead, New York five behind.
    expect(demoWeekEvents(lea, ...WEEK)[1].startAt.toISOString()).toBe("2026-11-16T09:00:00.000Z");
    expect(demoWeekEvents(jonas, ...WEEK)[0].startAt.toISOString()).toBe("2026-11-16T07:00:00.000Z");
    expect(demoWeekEvents(maya, ...WEEK)[0].startAt.toISOString()).toBe("2026-11-16T15:00:00.000Z");
  });

  it("keeps the wall-clock times across a clock change (Europe on 25 Oct, New York on 1 Nov 2026)", () => {
    const from = at("2026-10-19T00:00:00Z");
    const to = at("2026-11-07T00:00:00Z");
    const mondays = (events: { startAt: Date; title: string }[], title: string) => events.filter((e) => e.title === title).map((e) => e.startAt.toISOString());
    expect(mondays(demoWeekEvents(lea, from, to), "Morning run")).toEqual(["2026-10-19T06:30:00.000Z", "2026-10-26T07:30:00.000Z", "2026-11-02T07:30:00.000Z"]);
    expect(mondays(demoWeekEvents(jonas, from, to), "Tutorial")).toEqual(["2026-10-19T07:30:00.000Z", "2026-10-26T08:30:00.000Z", "2026-11-02T08:30:00.000Z"]);
    expect(mondays(demoWeekEvents(maya, from, to), "Design studio")).toEqual(["2026-10-19T14:00:00.000Z", "2026-10-26T14:00:00.000Z", "2026-11-02T15:00:00.000Z"]);
    for (const person of [lea, jonas, maya]) {
      for (const text of local(demoWeekEvents(person, from, to), person.timeZone)) {
        const slot = person.week.find((s) => text.endsWith(` ${s.title}`) && text.slice(11, 16) === s.from && text.slice(17, 22) === s.to);
        expect(slot, `${person.id} ${text}`).toBeDefined();
      }
    }
  });

  it("only blocks that overlap the window, also a window shorter than a day", () => {
    const events = demoWeekEvents(lea, at("2026-11-16T08:00:00Z"), at("2026-11-16T09:30:00Z"));
    expect(events.map((e) => e.title)).toEqual(["Morning run", "Statistics lecture"]);
    expect(demoWeekEvents(lea, at("2026-11-16T10:00:00Z"), at("2026-11-16T10:00:00Z"))).toEqual([]);
  });

  it("details: each block with title and place, nothing else", () => {
    const answer = demoCalendar(lea, ...WEEK)!;
    expect(answer.level).toBe("details");
    expect(answer.events[1]).toEqual({ allDay: false, startAt: "2026-11-16T09:00:00.000Z", endAt: "2026-11-16T10:30:00.000Z", title: "Statistics lecture", location: "Lecture hall 2" });
    for (const event of answer.events) for (const key of Object.keys(event)) expect(SHARED_EVENT_KEYS).toContain(key);
  });

  it("free/busy: only times, blocks that touch merged (R48)", () => {
    const answer = demoCalendar(jonas, ...WEEK)!;
    expect(answer.level).toBe("busy");
    expect(answer.events[0]).toEqual({ allDay: false, startAt: "2026-11-16T07:00:00.000Z", endAt: "2026-11-16T10:00:00.000Z" });
    expect(answer.events).toHaveLength(jonas.week.length - 1);
    for (const event of answer.events) expect(Object.keys(event).sort()).toEqual(["allDay", "endAt", "startAt"]);
  });

  it("someone who shares nothing has no calendar to show", () => {
    expect(demoCalendar(maya, ...WEEK)).toBeNull();
  });
});

describe("generated focus charts", () => {
  it("8 weeks and this week's days in the person's zone, days after today empty, the same every time", () => {
    // Tuesday 17 November, 10:00 in Lisbon.
    const chart = demoFocus(lea, at("2026-11-17T10:00:00Z"))!;
    expect(demoFocus(lea, at("2026-11-17T10:00:00Z"))).toEqual(chart);
    expect(chart.weeks.map((w) => w.monday)).toEqual(["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16"]);
    expect(chart.days.map((d) => d.date)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    expect(chart.days.map((d) => d.focusedMinutes)).toEqual([90, 120, 0, 0, 0, 0, 0]);
    expect(chart.weeks[7]).toEqual({ monday: "2026-11-16", focusedMinutes: 210, sessions: 4 });
    for (const week of chart.weeks) expect(Object.keys(week).sort()).toEqual([...FOCUS_WEEK_KEYS].sort());
    for (const day of chart.days) expect(Object.keys(day).sort()).toEqual([...FOCUS_DAY_KEYS].sort());
  });

  it("cuts the week in the person's zone: Sunday night in Lisbon is still last week there", () => {
    // Monday 23 November 00:30 in Berlin is Sunday 22 November 23:30 in Lisbon.
    const chart = demoFocus(lea, at("2026-11-22T23:30:00Z"))!;
    expect(chart.weeks[7].monday).toBe("2026-11-16");
    expect(chart.days.every((d) => d.focusedMinutes === lea.usualDays[chart.days.indexOf(d)].minutes)).toBe(true);
  });

  it("someone who does not share their chart has none", () => {
    expect(demoFocus(jonas, at("2026-11-17T10:00:00Z"))).toBeNull();
    expect(demoFocus(maya, at("2026-11-17T10:00:00Z"))).toBeNull();
  });
});
