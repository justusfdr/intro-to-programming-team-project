// How events become the calendar's days (one, seven or the month's 42): local times, the conflict mark (R10) and the day each one shows
// on (R2). Pure functions, used by the server when it reads the week and by the screen when it shows
// an action's answer at once (src/components/live/Live.tsx), so both show an event the same way.
import { localDateOf, localDateTimeOf, localTimeOf } from "@/lib/time/zoned";
import { conflictIds } from "./conflicts";
import type { AllDayEvent, EventDto, WeekData, WeekDay, WeekEvent } from "./types";

/** A timed event as the server sends it (start and end are set). */
export type TimedEventDto = EventDto & { allDay: false; startAt: string; endAt: string };

/** Timed events with their conflict mark and local times. `events` may reach past the week's edges. */
export function toWeekEvents(events: readonly TimedEventDto[], timeZone: string): WeekEvent[] {
  const marked = conflictIds(
    events.map((e) => ({ id: e.id, startAt: new Date(e.startAt), endAt: new Date(e.endAt), mayOverlap: e.mayOverlap })),
  );
  return events.map((e) => {
    const start = new Date(e.startAt);
    const end = new Date(e.endAt);
    const endDay = localDateOf(end, timeZone);
    return {
      ...e,
      conflict: marked.has(e.id),
      startTime: localTimeOf(start, timeZone),
      endTime: localTimeOf(end, timeZone),
      endDay: endDay === localDateOf(start, timeZone) ? null : endDay,
      startLocal: localDateTimeOf(start, timeZone),
      endLocal: localDateTimeOf(end, timeZone),
    };
  });
}

/** An all-day event as the week shows it. */
export function toAllDayEvent(e: EventDto): AllDayEvent {
  return {
    id: e.id,
    title: e.title,
    allDay: true,
    firstDay: e.firstDay!,
    lastDay: e.lastDay!,
    mayOverlap: e.mayOverlap,
    status: e.status,
    goalId: e.goalId,
    seriesId: e.seriesId,
    source: e.source,
    location: e.location,
    notSent: e.notSent,
    updatedAt: e.updatedAt,
    todoCount: e.todoCount,
    todosDone: e.todosDone,
  };
}

/** The days with their events: a timed event on the day it starts, an all-day event on each of its days (R2). */
export function arrangeDays(
  days: readonly Pick<WeekDay, "date" | "label" | "isToday">[],
  shown: readonly WeekEvent[],
  allDay: readonly AllDayEvent[],
): WeekDay[] {
  return days.map(({ date, label, isToday }) => ({
    date,
    label,
    isToday,
    events: shown.filter((e) => e.startLocal.slice(0, 10) === date),
    allDay: allDay.filter((e) => e.firstDay <= date && date <= e.lastDay),
  }));
}

/**
 * Events that started before `firstDay` and run past its midnight (an event lasts at most 24 hours,
 * so they started the day before). Shown only as their part after midnight.
 */
export function leadInto(shown: readonly WeekEvent[], firstDay: string): WeekEvent[] {
  return shown.filter((e) => e.startLocal.slice(0, 10) < firstDay && e.endLocal > `${firstDay}T00:00`);
}

/** Back from a WeekEvent to the event as the server sends it (without the calculated fields). */
function timedDtoOf(e: WeekEvent): TimedEventDto {
  return {
    id: e.id,
    title: e.title,
    allDay: false,
    startAt: e.startAt,
    endAt: e.endAt,
    firstDay: null,
    lastDay: null,
    mayOverlap: e.mayOverlap,
    status: e.status,
    goalId: e.goalId,
    seriesId: e.seriesId,
    source: e.source,
    location: e.location,
    travelMode: e.travelMode,
    notSent: e.notSent,
    updatedAt: e.updatedAt,
    todoCount: e.todoCount,
    todosDone: e.todosDone,
  };
}

const byTime = (a: TimedEventDto, b: TimedEventDto) =>
  a.startAt.localeCompare(b.startAt) || a.endAt.localeCompare(b.endAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const byDays = (a: AllDayEvent, b: AllDayEvent) =>
  a.firstDay.localeCompare(b.firstDay) || b.lastDay.localeCompare(a.lastDay) || a.title.localeCompare(b.title) || (a.id < b.id ? -1 : 1);

/** A change an action's answer describes: an event as saved, or the id of a removed one. */
export type EventChange = { event: EventDto } | { removed: string };

/**
 * The week with one event saved or removed, calculated the way the server does it. Used to show the
 * answer of an action at once, until the page's next read arrives. (Conflicts with events just
 * outside the week are not known here; the next read brings them.)
 */
export function withEventChange(week: WeekData, change: EventChange): WeekData {
  const id = "event" in change ? change.event.id : change.removed;
  const timed = new Map<string, TimedEventDto>();
  const allDay = new Map<string, AllDayEvent>();
  for (const e of week.lead) timed.set(e.id, timedDtoOf(e));
  for (const day of week.days) {
    for (const e of day.events) timed.set(e.id, timedDtoOf(e));
    for (const e of day.allDay) allDay.set(e.id, e);
  }
  // The "not sent to Outlook" mark (R26) stays as it was; the next read recalculates it.
  const notSent = timed.get(id)?.notSent ?? allDay.get(id)?.notSent ?? false;
  timed.delete(id);
  allDay.delete(id);
  if ("event" in change) {
    const event = { ...change.event, notSent };
    if (event.allDay) allDay.set(id, toAllDayEvent(event));
    else if (event.startAt && event.endAt) timed.set(id, { ...event, allDay: false, startAt: event.startAt, endAt: event.endAt });
  }
  const shown = toWeekEvents([...timed.values()].sort(byTime), week.timeZone);
  return {
    ...week,
    days: arrangeDays(week.days, shown, [...allDay.values()].sort(byDays)),
    lead: leadInto(shown, week.days[0].date),
  };
}

/** The week with one event's status changed (shown at once when the user marks it done or planned). */
export function withEventStatus(week: WeekData, id: string, status: EventDto["status"]): WeekData {
  return {
    ...week,
    lead: week.lead.map((e) => (e.id === id ? { ...e, status } : e)),
    days: week.days.map((day) => ({
      ...day,
      events: day.events.map((e) => (e.id === id ? { ...e, status } : e)),
      allDay: day.allDay.map((e) => (e.id === id ? { ...e, status } : e)),
    })),
  };
}

/** The week with one event's to-do numbers changed (spec 21: shown at once after a change of its list). */
export function withEventTodos(week: WeekData, id: string, todoCount: number, todosDone: number): WeekData {
  const set = <E extends { id: string }>(e: E): E => (e.id === id ? { ...e, todoCount, todosDone } : e);
  return {
    ...week,
    lead: week.lead.map(set),
    days: week.days.map((day) => ({ ...day, events: day.events.map(set), allDay: day.allDay.map(set) })),
  };
}
