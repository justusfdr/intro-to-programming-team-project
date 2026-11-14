// The event editor's values and what it sends (spec 16). Pure functions, tested in values.test.ts; the
// server checks every rule.
//
// The editor shows an event as plain values (title, day, start and end in minutes, goal, location …).
// An existing event is saved with the Save button (spec 17): edit_event gets all the event's fields
// and the updated_at the screen last saw (R4). An Outlook event sends only its goal (R11).
import type { TravelMode } from "@/lib/settings/types";
import type { Changes } from "@/components/live/Live";
import type { PostResult } from "@/lib/client/post-json";
import { localAt } from "@/lib/events/drag";
import { cleanNotes } from "@/lib/events/notes";
import { minuteOfLocal } from "@/lib/events/grid";
import type { CalendarEvent, EventDto } from "@/lib/events/types";
import { toAllDayEvent, toWeekEvents, withEventChange, type TimedEventDto } from "@/lib/events/week-view";
import { addDays, parseLocalDateTime } from "@/lib/time/zoned";
import type { NewTodo } from "@/lib/todos/types";
import type { Scope } from "../event-changes";

export type EventValues = {
  title: string;
  allDay: boolean;
  /** The day of a timed event, "2026-11-17". */
  date: string;
  /** Minutes from midnight of `date`; the end may be past midnight (more than 24 hours). */
  startMin: number;
  endMin: number;
  /** The days of an all-day event. */
  firstDay: string;
  lastDay: string;
  goalId: string | null;
  mayOverlap: boolean;
  /** "" is none. */
  location: string;
  /**
   * Spec 24: the guests' addresses, sent with Save (Outlook invites them). Left out (or empty) when the
   * event has none.
   */
  guests?: string[];
  /** How to get there; null is the standard from the settings (R27). */
  travelMode: TravelMode | null;
  /**
   * Issue #5: the notes as typed (saved with whitespace at the end trimmed; empty is none). Left out (or
   * empty) when the event has none. Never for an Outlook event (R11).
   */
  notes?: string;
};

/** The end in minutes from midnight of the start's day; past midnight it is more than 24 hours. */
function endMinuteOf(start: string, end: string): number {
  const length = Math.round((Date.parse(`${end}:00Z`) - Date.parse(`${start}:00Z`)) / 60_000);
  return minuteOfLocal(start) + (Number.isFinite(length) ? length : 60);
}

/**
 * After a save: the saved values for the fields the user did not change while it was on its way. A
 * field typed in meanwhile (its value differs from what was sent) is left out, so the typing is kept.
 */
export function untouchedPatch(sent: EventValues, current: EventValues, saved: EventValues): Partial<EventValues> {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(saved) as (keyof EventValues)[]) {
    if (JSON.stringify(current[key]) === JSON.stringify(sent[key])) patch[key] = saved[key];
  }
  return patch as Partial<EventValues>;
}

/** The values of an existing event. Timed and all-day fields both get values, so the switch can flip. */
export function valuesOf(event: CalendarEvent): EventValues {
  const common = {
    title: event.title,
    goalId: event.goalId,
    mayOverlap: event.mayOverlap,
    location: event.location ?? "",
    travelMode: event.travelMode ?? null,
    // Always named (also when undefined), so Discard and an answer put the saved guests back.
    guests: event.guests && event.guests.length > 0 ? [...event.guests] : undefined,
    // Issue #5: also always named, so Discard and an answer put the saved notes back.
    notes: event.notes || undefined,
  };
  if (event.allDay) {
    return { ...common, allDay: true, date: event.firstDay, startMin: 9 * 60, endMin: 10 * 60, firstDay: event.firstDay, lastDay: event.lastDay, goalId: null };
  }
  const date = event.startLocal.slice(0, 10);
  return {
    ...common,
    allDay: false,
    date,
    startMin: minuteOfLocal(event.startLocal),
    endMin: endMinuteOf(event.startLocal, event.endLocal),
    firstDay: date,
    lastDay: date,
  };
}

/** The values of a new event from local start and end ("2026-11-17T09:00"). */
export function newValues(draft: { start: string; end: string; title?: string; goalId?: string | null }): EventValues {
  const date = draft.start.slice(0, 10);
  return {
    title: draft.title ?? "",
    allDay: false,
    date,
    startMin: minuteOfLocal(draft.start),
    endMin: endMinuteOf(draft.start, draft.end),
    firstDay: date,
    lastDay: date,
    goalId: draft.goalId ?? null,
    mayOverlap: false,
    location: "",
    travelMode: null,
  };
}

/** The values after the all-day switch: all day keeps the day; timed again starts at 9am for an hour. */
export function switchAllDay(values: EventValues, allDay: boolean): Partial<EventValues> {
  if (allDay) return { allDay: true, firstDay: values.date, lastDay: values.date };
  return { allDay: false, date: values.firstDay, startMin: 9 * 60, endMin: 10 * 60 };
}

/** A new first day of an all-day event keeps its number of days. */
export function moveFirstDay(values: EventValues, firstDay: string): Partial<EventValues> {
  const days = Math.round((Date.parse(values.lastDay) - Date.parse(values.firstDay)) / 86_400_000);
  return { firstDay, lastDay: addDays(firstDay, Math.max(0, days)) };
}

/** The fields create_event and edit_event share, from the values. */
function fieldsOf(values: EventValues) {
  const location = values.location.trim() || null;
  if (values.allDay) return { title: values.title, allDay: true, firstDay: values.firstDay, lastDay: values.lastDay, location };
  return {
    title: values.title,
    start: localAt(values.date, values.startMin),
    end: localAt(values.date, values.endMin),
    mayOverlap: values.mayOverlap,
    goalId: values.goalId,
    location,
    travelMode: values.travelMode,
  };
}

/**
 * The body of edit_event for these values. An Outlook event sends only its goal (R11). The guests go
 * along when the event has some or the editor added some (an empty list removes them, spec 24); the
 * notes likewise (null removes them, issue #5).
 */
export function editBody(event: CalendarEvent, values: EventValues, updatedAt: string, scope?: Scope): Record<string, unknown> {
  if (event.source === "outlook") return { goalId: values.goalId, updatedAt };
  const guests = values.guests ?? [];
  const withGuests = guests.length > 0 || (event.guests?.length ?? 0) > 0 ? { guests } : {};
  const notes = cleanNotes(values.notes);
  const withNotes = notes !== null || event.notes ? { notes } : {};
  return { ...fieldsOf(values), ...withGuests, ...withNotes, updatedAt, ...(scope ? { scope } : {}) };
}

/** Whether these values would change the saved event (the Save button shows only then). */
export function isChanged(event: CalendarEvent, values: EventValues): boolean {
  const trimmed = { ...values, title: values.title.trim() };
  return JSON.stringify(editBody(event, trimmed, "")) !== JSON.stringify(editBody(event, valuesOf(event), ""));
}

export type Repeat = { frequency: "daily" | "weekly" | "monthly"; weekdays: number[]; until: string };

/**
 * The body of create_event (from "Add details"), with a repeat for a new timed series (R28) and the
 * new event's to-dos (spec 21; left out when there are none).
 */
export function createBody(values: EventValues, repeat: Repeat | null, todos: readonly NewTodo[] = []): Record<string, unknown> {
  return {
    ...fieldsOf(values),
    ...(repeat && !values.allDay ? { repeat } : {}),
    ...(todos.length > 0 ? { todos: todos.map((t) => ({ title: t.title, done: t.done })) } : {}),
    // Spec 24: the guests of a single event (a series takes none; the editor does not offer it).
    ...(values.guests && values.guests.length > 0 && !(repeat && !values.allDay) ? { guests: [...values.guests] } : {}),
    // Issue #5: the notes (a series gets them on every event).
    ...(cleanNotes(values.notes) !== null ? { notes: cleanNotes(values.notes) } : {}),
  };
}

/**
 * The event as it will be saved, shown in the calendar as soon as Save is clicked. Null for
 * "this and following", whose events each keep their own date (the re-read brings them), and for times
 * that are not real in the time zone (the server refuses them anyway).
 */
export function editedChange(event: CalendarEvent, values: EventValues, timeZone: string, scope?: Scope): Changes | null {
  if (scope === "this_and_following") return null;
  const base: Omit<EventDto, "allDay" | "startAt" | "endAt" | "firstDay" | "lastDay"> = {
    id: event.id,
    title: event.source === "outlook" ? event.title : values.title.trim() || event.title,
    mayOverlap: values.mayOverlap,
    status: event.status,
    goalId: values.goalId,
    seriesId: event.seriesId,
    source: event.source,
    location: event.source === "outlook" ? event.location : values.location.trim() || null,
    travelMode: event.source === "outlook" || values.allDay ? event.travelMode : values.travelMode,
    notSent: event.notSent,
    updatedAt: event.updatedAt,
    // A change of the event keeps its to-dos (spec 21).
    todoCount: event.todoCount,
    todosDone: event.todosDone,
    // Spec 24: an Outlook event keeps Outlook's people; our own event shows the guests being saved.
    guests: event.source === "outlook" ? event.guests : values.guests && values.guests.length > 0 ? [...values.guests] : undefined,
    organizer: event.organizer,
    // Issue #5: the notes being saved (an Outlook event has none).
    notes: event.source === "outlook" ? event.notes : (cleanNotes(values.notes) ?? undefined),
    demo: event.demo,
  };
  if (event.source === "outlook") {
    const dto: EventDto = event.allDay
      ? { ...base, allDay: true, startAt: null, endAt: null, firstDay: event.firstDay, lastDay: event.lastDay, goalId: null }
      : { ...base, mayOverlap: event.mayOverlap, allDay: false, startAt: event.startAt, endAt: event.endAt, firstDay: null, lastDay: null };
    return { week: (week) => withEventChange(week, { event: dto }) };
  }
  if (values.allDay) {
    const dto: EventDto = { ...base, allDay: true, startAt: null, endAt: null, firstDay: values.firstDay, lastDay: values.lastDay, goalId: null, status: "planned" };
    return { week: (week) => withEventChange(week, { event: dto }) };
  }
  const startAt = parseLocalDateTime(localAt(values.date, values.startMin), timeZone);
  const endAt = parseLocalDateTime(localAt(values.date, values.endMin), timeZone);
  if (!startAt || !endAt || endAt <= startAt) return null;
  const dto: EventDto = { ...base, allDay: false, startAt: startAt.toISOString(), endAt: endAt.toISOString(), firstDay: null, lastDay: null };
  return { week: (week) => withEventChange(week, { event: dto }) };
}

/** The event in an accepted answer, as the editor shows it; the marks the server calculates stay as they were. */
export function eventFromAnswer(answer: PostResult, timeZone: string, before?: CalendarEvent): CalendarEvent | null {
  const dto = (answer.data as { event?: EventDto } | undefined)?.event;
  if (!dto) return null;
  const saved = { ...dto, notSent: before?.notSent ?? dto.notSent };
  if (saved.allDay) return toAllDayEvent(saved);
  if (!saved.startAt || !saved.endAt) return null;
  const [timed] = toWeekEvents([saved as TimedEventDto], timeZone);
  return { ...timed, conflict: before && !before.allDay ? before.conflict : false };
}

/** The later of two copies of the same event (by updated_at): the editor's own and the calendar's. */
export function newer(a: CalendarEvent, b: CalendarEvent | null | undefined): CalendarEvent {
  if (!b || b.id !== a.id) return a;
  return Date.parse(b.updatedAt) > Date.parse(a.updatedAt) ? b : a;
}
