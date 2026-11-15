// Demo contacts (spec 32): three made-up people a user can switch on to try People, sharing and the
// shared calendars without anyone else. They live only here, in code. They are not accounts: no row in
// auth.users, app.contacts, app.shares or anywhere else, they cannot sign in, receive nothing, and
// nothing of the user is ever shared with them. The database keeps only the user's choice to see them
// (app.profiles.demo_contacts); the server's page loaders and read actions add them after the real rows.
//
// Their ids are fixed texts that can never be a real user's id (those are uuids). Their calendars and
// focus charts are generated here, from the same usual week every time (lectures, sport, a group
// meeting), in each person's own time zone, relative to the asked days or to "now". No randomness:
// the same input always gives the same output.
import type { AvatarLook } from "@/lib/profiles/types";
import {
  NOTHING_SHARED,
  type SharedCalendarAnswer,
  type SharedFocusAnswer,
  type SharedTimed,
  type ShareSetting,
  type SharingPerson,
} from "@/lib/shares/types";
import { addDays, localDateOf, mondayOf, parseLocalDateTime } from "@/lib/time/zoned";

/** The three ids, in the order the screens list the demo contacts. */
export const DEMO_IDS = ["demo-lea", "demo-jonas", "demo-maya"] as const;
export type DemoId = (typeof DEMO_IDS)[number];

/** Exactly one of the three ids (case and spaces count): nothing else is ever a demo contact. */
export function isDemoId(id: unknown): id is DemoId {
  return typeof id === "string" && (DEMO_IDS as readonly string[]).includes(id);
}

/** One block of a demo person's usual week, in their own time zone. `day`: 0 = Monday. */
export type DemoSlot = { day: number; from: string; to: string; title: string; location: string | null };

export type DemoPerson = {
  id: DemoId;
  name: string;
  bio: string;
  /** Clearly not a real person's profile. */
  linkedinUrl: string;
  timeZone: string;
  look: AvatarLook;
  /** What they share with the user. Nothing of the user's is ever shared with them. */
  shares: ShareSetting;
  /** Their usual week, the same every week. */
  week: DemoSlot[];
  /** Focused minutes and finished sessions of the 7 weeks before the current one, oldest first. */
  pastWeeks: { minutes: number; sessions: number }[];
  /** Focused minutes and finished sessions of each day of a usual week, Monday first. */
  usualDays: { minutes: number; sessions: number }[];
};

export const DEMO_PEOPLE: readonly DemoPerson[] = [
  {
    id: "demo-lea",
    name: "Lea Sousa",
    bio: "Statistics student. Running before lectures, revising after.",
    linkedinUrl: "https://www.linkedin.com/in/lockedin-demo-lea",
    timeZone: "Europe/Lisbon",
    look: { initials: "LS", color: "#0f766e" },
    shares: { calendar: "details", focus: true },
    week: [
      { day: 0, from: "07:30", to: "08:15", title: "Morning run", location: "Riverside path" },
      { day: 0, from: "09:00", to: "10:30", title: "Statistics lecture", location: "Lecture hall 2" },
      { day: 1, from: "10:00", to: "12:00", title: "Group project meeting", location: "Library, room 4" },
      { day: 1, from: "14:00", to: "16:00", title: "Revision: probability", location: null },
      { day: 2, from: "09:00", to: "10:30", title: "Statistics lecture", location: "Lecture hall 2" },
      { day: 2, from: "18:00", to: "19:00", title: "Running club", location: "Riverside path" },
      { day: 3, from: "14:00", to: "16:30", title: "Library: exam prep", location: "Main library" },
      { day: 4, from: "11:00", to: "12:00", title: "Group project meeting", location: "Library, room 4" },
      { day: 5, from: "09:00", to: "10:30", title: "Long run", location: "Riverside path" },
    ],
    pastWeeks: [
      { minutes: 380, sessions: 7 },
      { minutes: 420, sessions: 8 },
      { minutes: 310, sessions: 6 },
      { minutes: 455, sessions: 9 },
      { minutes: 500, sessions: 10 },
      { minutes: 395, sessions: 8 },
      { minutes: 470, sessions: 9 },
    ],
    usualDays: [
      { minutes: 90, sessions: 2 },
      { minutes: 120, sessions: 2 },
      { minutes: 60, sessions: 1 },
      { minutes: 105, sessions: 2 },
      { minutes: 45, sessions: 1 },
      { minutes: 30, sessions: 1 },
      { minutes: 0, sessions: 0 },
    ],
  },
  {
    id: "demo-jonas",
    name: "Jonas Becker",
    bio: "Economics in Berlin. Football on Tuesdays, always up for a study group.",
    linkedinUrl: "https://www.linkedin.com/in/lockedin-demo-jonas",
    timeZone: "Europe/Berlin",
    look: { initials: "JB", color: "#b45309" },
    shares: { calendar: "busy", focus: false },
    week: [
      { day: 0, from: "08:00", to: "09:30", title: "Macroeconomics lecture", location: "Hall A" },
      { day: 0, from: "09:30", to: "11:00", title: "Tutorial", location: "Room 2.14" },
      { day: 1, from: "17:00", to: "18:30", title: "Football training", location: "Sports ground" },
      { day: 2, from: "10:00", to: "12:00", title: "Econometrics lecture", location: "Hall B" },
      { day: 3, from: "13:00", to: "14:00", title: "Study group", location: "Café near campus" },
      { day: 4, from: "08:00", to: "10:00", title: "Macroeconomics lecture", location: "Hall A" },
      { day: 5, from: "11:00", to: "12:30", title: "Football match", location: "Sports ground" },
    ],
    pastWeeks: [],
    usualDays: [],
  },
  {
    id: "demo-maya",
    name: "Maya Brooks",
    bio: "Design student in New York. Shares nothing yet.",
    linkedinUrl: "https://www.linkedin.com/in/lockedin-demo-maya",
    timeZone: "America/New_York",
    look: { initials: "MB", color: "#4f46e5" },
    shares: NOTHING_SHARED,
    week: [
      { day: 0, from: "10:00", to: "12:00", title: "Design studio", location: "Studio 3" },
      { day: 2, from: "07:00", to: "08:00", title: "Swimming", location: "Campus pool" },
      { day: 3, from: "15:00", to: "16:00", title: "Group critique", location: "Studio 3" },
    ],
    pastWeeks: [],
    usualDays: [],
  },
];

/** The demo person with this id, or null for anything else. */
export function demoPerson(id: string): DemoPerson | null {
  return DEMO_PEOPLE.find((p) => p.id === id) ?? null;
}

/**
 * The person's own events that overlap [from, to): their usual week, repeated for every week the
 * window touches, each block placed at its local time in their own time zone (so a clock change moves
 * it in UTC, never on their wall clock). Sorted by start.
 */
export function demoWeekEvents(person: DemoPerson, from: Date, to: Date): { startAt: Date; endAt: Date; title: string; location: string | null }[] {
  if (!(to > from) || person.week.length === 0) return [];
  // One week either side of the window's local days, so blocks near midnight in another zone are not missed.
  const firstMonday = addDays(mondayOf(localDateOf(from, person.timeZone)), -7);
  const lastMonday = addDays(mondayOf(localDateOf(new Date(to.getTime() - 1), person.timeZone)), 7);
  const events: { startAt: Date; endAt: Date; title: string; location: string | null }[] = [];
  for (let monday = firstMonday; monday <= lastMonday; monday = addDays(monday, 7)) {
    for (const slot of person.week) {
      const date = addDays(monday, slot.day);
      const startAt = parseLocalDateTime(`${date}T${slot.from}`, person.timeZone);
      const endAt = parseLocalDateTime(`${date}T${slot.to}`, person.timeZone);
      if (!startAt || !endAt || !(endAt > startAt)) continue;
      if (startAt < to && endAt > from) events.push({ startAt, endAt, title: slot.title, location: slot.location });
    }
  }
  return events.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

/**
 * What the user sees of a demo person's calendar for [from, to), in the shape a real shared calendar
 * has (R48): at "busy" only the times, with blocks that overlap or touch merged; at "details" each
 * block with its title and place. Null when the person does not share their calendar.
 */
export function demoCalendar(person: DemoPerson, from: Date, to: Date): SharedCalendarAnswer | null {
  const level = person.shares.calendar;
  if (level === "none") return null;
  const own = demoWeekEvents(person, from, to);
  if (level === "details") {
    return {
      level,
      events: own.map((e): SharedTimed => ({ allDay: false, startAt: e.startAt.toISOString(), endAt: e.endAt.toISOString(), title: e.title, location: e.location })),
    };
  }
  const merged: { start: number; end: number }[] = [];
  for (const e of own) {
    const last = merged[merged.length - 1];
    if (last && e.startAt.getTime() <= last.end) last.end = Math.max(last.end, e.endAt.getTime());
    else merged.push({ start: e.startAt.getTime(), end: e.endAt.getTime() });
  }
  return {
    level,
    events: merged.map((b): SharedTimed => ({ allDay: false, startAt: new Date(b.start).toISOString(), endAt: new Date(b.end).toISOString() })),
  };
}

/**
 * A demo person's focus chart at `now` (R49's shape): the current week and the 7 before, cut in their
 * own time zone, and this week's days, with the days after today still empty. Null when they do not
 * share it.
 */
export function demoFocus(person: DemoPerson, now: Date): SharedFocusAnswer | null {
  if (!person.shares.focus) return null;
  const today = localDateOf(now, person.timeZone);
  const monday = mondayOf(today);
  const days = person.usualDays.map((usual, i) => {
    const date = addDays(monday, i);
    return date <= today ? { date, focusedMinutes: usual.minutes, sessions: usual.sessions } : { date, focusedMinutes: 0, sessions: 0 };
  });
  const weeks = person.pastWeeks.map((w, i) => ({ monday: addDays(monday, -7 * (person.pastWeeks.length - i)), focusedMinutes: w.minutes, sessions: w.sessions }));
  weeks.push({
    monday,
    focusedMinutes: days.reduce((sum, d) => sum + d.focusedMinutes, 0),
    sessions: days.reduce((sum, d) => sum + d.sessions, 0),
  });
  return { weeks, days };
}

/** What a demo person shares with the user, as the calendar and analytics pages list real people. */
export function demoSharingPerson(person: DemoPerson): SharingPerson {
  return { userId: person.id, name: person.name, photoUrl: null, calendar: person.shares.calendar, focus: person.shares.focus, demo: person.look };
}

/** The demo people who share something, for the calendar's "People" and Analytics. */
export function demoSharingPeople(): SharingPerson[] {
  return DEMO_PEOPLE.filter((p) => p.shares.calendar !== "none" || p.shares.focus).map(demoSharingPerson);
}

/** A demo contact as the People page lists it (no e-mail address: they have none). */
export type DemoContact = {
  userId: DemoId;
  name: string;
  bio: string;
  timeZone: string;
  look: AvatarLook;
  /** What they share with the user. */
  shared: ShareSetting;
};

export const DEMO_CONTACT_KEYS = ["bio", "look", "name", "shared", "timeZone", "userId"] as const;

export function demoContacts(): DemoContact[] {
  return DEMO_PEOPLE.map((p) => ({ userId: p.id, name: p.name, bio: p.bio, timeZone: p.timeZone, look: p.look, shared: p.shares }));
}

/** A demo contact's profile page: like a real card, without an e-mail address, marked as a demo. */
export type DemoProfileCard = {
  demo: true;
  userId: DemoId;
  name: string;
  bio: string;
  linkedinUrl: string;
  timeZone: string;
  look: AvatarLook;
};

export const DEMO_CARD_KEYS = ["bio", "demo", "linkedinUrl", "look", "name", "timeZone", "userId"] as const;

export function demoProfileCard(person: DemoPerson): DemoProfileCard {
  return { demo: true, userId: person.id, name: person.name, bio: person.bio, linkedinUrl: person.linkedinUrl, timeZone: person.timeZone, look: person.look };
}
