// Where the events of a shared calendar sit on the viewer's screen (spec 29). Pure functions, no React.
// A shared event is never an event of the viewer's: it has its own type, no id, and never goes through
// the viewer's drag, overlap (R10) or editor code. Times come as UTC from the server and are placed in
// the VIEWER's time zone (their calendar); all-day events keep their dates.
import { addDays, localDateOf, localDateTimeOf, startOfLocalDate } from "@/lib/time/zoned";
import { MAX_SHOWN_CALENDARS, type SharedAllDay, type SharedEvent, type SharingPerson } from "./types";

const DAY_MIN = 24 * 60;

/** The window to ask for the shown days: from the first day's midnight to the midnight after the last. */
export function windowOf(days: readonly string[], timeZone: string): { from: string; to: string } {
  const first = days[0];
  const last = days[days.length - 1];
  return { from: startOfLocalDate(first, timeZone).toISOString(), to: startOfLocalDate(addDays(last, 1), timeZone).toISOString() };
}

/** A shared calendar as the screen draws it: whose it is, its level, its events. */
export type ShownCalendar = { person: SharingPerson; level: "busy" | "details"; events: SharedEvent[] };

/** One shared timed event's part on one day, with its lane among the shared blocks of that day. */
export type SharedBlock = {
  person: SharingPerson;
  level: "busy" | "details";
  /** A stable key for React, from the person and the times (no event id ever reaches the screen). */
  key: string;
  title: string | null;
  location: string | null;
  startAt: string;
  endAt: string;
  startMin: number;
  endMin: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
  lane: number;
  lanes: number;
};

/** The minute of the day of a local "YYYY-MM-DDTHH:MM", as the grid counts. */
const minuteOf = (local: string) => Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16));

/** Gives overlapping blocks side-by-side lanes (blocks sorted by start; one lane count per overlapping group). */
function laneUp(blocks: SharedBlock[]): SharedBlock[] {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  let group: SharedBlock[] = [];
  let groupEnd = -1;
  const done: SharedBlock[] = [];
  const close = () => {
    const lanesEnd: number[] = [];
    for (const block of group) {
      let lane = lanesEnd.findIndex((end) => end <= block.startMin);
      if (lane === -1) lane = lanesEnd.length;
      lanesEnd[lane] = block.endMin;
      block.lane = lane;
    }
    for (const block of group) block.lanes = lanesEnd.length;
    done.push(...group);
  };
  for (const block of sorted) {
    if (group.length > 0 && block.startMin >= groupEnd) {
      close();
      group = [];
      groupEnd = -1;
    }
    group.push({ ...block });
    groupEnd = Math.max(groupEnd, block.endMin);
  }
  if (group.length > 0) close();
  return done;
}

/**
 * The shared timed blocks of each shown day, in the viewer's time zone. An event past midnight gets a
 * block on each day it touches (cut at midnight), as the viewer's own events do.
 */
export function placeShared(calendars: readonly ShownCalendar[], days: readonly string[], timeZone: string): SharedBlock[][] {
  return days.map((day) => {
    const dayStart = startOfLocalDate(day, timeZone).getTime();
    const dayEnd = startOfLocalDate(addDays(day, 1), timeZone).getTime();
    const blocks: SharedBlock[] = [];
    for (const { person, level, events } of calendars) {
      for (const event of events) {
        if (event.allDay) continue;
        const start = Date.parse(event.startAt);
        const end = Date.parse(event.endAt);
        if (!(start < dayEnd && end > dayStart)) continue;
        const continuesBefore = start < dayStart;
        const continuesAfter = end > dayEnd;
        const startMin = continuesBefore ? 0 : minuteOf(localDateTimeOf(new Date(start), timeZone));
        const endMin = continuesAfter ? DAY_MIN : Math.max(startMin + 1, endOfDayMinute(end, day, timeZone));
        blocks.push({
          person,
          level,
          key: `${person.userId}-${event.startAt}-${event.endAt}-${event.title ?? ""}`,
          title: event.title ?? null,
          location: event.location ?? null,
          startAt: event.startAt,
          endAt: event.endAt,
          startMin,
          endMin,
          continuesBefore,
          continuesAfter,
          lane: 0,
          lanes: 1,
        });
      }
    }
    return laneUp(blocks);
  });
}

/** The minute an end falls on, on its day (an end at the next midnight is 24:00). */
function endOfDayMinute(end: number, day: string, timeZone: string): number {
  const local = localDateTimeOf(new Date(end), timeZone);
  return local.slice(0, 10) === day ? minuteOf(local) : DAY_MIN;
}

/** A shared all-day event on the days it covers, with whose it is. */
export type SharedAllDayItem = { person: SharingPerson; level: "busy" | "details"; key: string; event: SharedAllDay };

/** The shared all-day events covering each shown day. */
export function sharedAllDayByDay(calendars: readonly ShownCalendar[], days: readonly string[]): SharedAllDayItem[][] {
  return days.map((day) => {
    const items: SharedAllDayItem[] = [];
    for (const { person, level, events } of calendars) {
      for (const event of events) {
        if (!event.allDay || event.firstDay > day || event.lastDay < day) continue;
        items.push({ person, level, key: `${person.userId}-${event.firstDay}-${event.lastDay}-${event.title ?? ""}`, event });
      }
    }
    return items;
  });
}

/** The day a shared timed event starts on, in the viewer's zone (for the month view's list). */
export function sharedStartDay(startAt: string, timeZone: string): string {
  return localDateOf(new Date(startAt), timeZone);
}

/**
 * The people the viewer chose to show, as remembered: only ids of people who still share their calendar,
 * at most three (R51), in the order chosen.
 */
export function keepChosen(chosen: readonly unknown[], people: readonly SharingPerson[]): string[] {
  const allowed = new Set(people.filter((p) => p.calendar !== "none").map((p) => p.userId));
  const kept: string[] = [];
  for (const id of chosen) if (typeof id === "string" && allowed.has(id) && !kept.includes(id)) kept.push(id);
  return kept.slice(0, MAX_SHOWN_CALENDARS);
}

/** Turns one person on or off; refuses a fourth (returns the list unchanged). */
export function toggleChosen(chosen: readonly string[], userId: string): string[] {
  if (chosen.includes(userId)) return chosen.filter((id) => id !== userId);
  if (chosen.length >= MAX_SHOWN_CALENDARS) return [...chosen];
  return [...chosen, userId];
}
