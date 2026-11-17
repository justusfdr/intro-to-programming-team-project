// R23: the checks every answer of the assistant must pass before anything is saved, and again before
// a draft is accepted. Pure: no database, no clock of its own. One failed check rejects the whole
// answer (R1); there is no second try.
//
// Spec 20: a draft may also move and delete existing events. The assistant names an event only by the
// reference it got with this one request ("e1"); the server turns it back into the event at once
// (`targets`). Moves and deletes are checked on the calendar as it would be after the whole draft.
//
// Spec 21: a new event may carry to-dos (the things the person wants to do during it): 0 to 20
// titles, each 1 to 100 characters after trimming.
//
// Spec 23: a draft may also add to-dos to an event already in the calendar, named by its reference like
// a move: 1 to 20 titles, each 1 to 100 characters after trimming, and the event's to-dos now plus the
// new ones at most 20. An event the draft deletes gets nothing else; each event at most once per kind.
// Each "to-dos for an event" counts as one of the draft's 30 things.
//
// Spec 43 (R23 extended): a new event of a draft that names a goal must not start on a weekday the goal
// is never done on (its start's weekday in the person's time zone; the start decides, so an event from
// 23:30 on an allowed day into a never day passes). Moves of existing events and events without a goal
// are not affected; the person's own events in the calendar are never checked against it. The part of
// the day and the time for the way there are wishes for the coach, not checked.
//
// The assistant answers with local date-times ("2026-11-14T09:00") in the user's time zone. They are
// turned into instants with the project's own helpers; a time that does not exist in the zone (the
// hour skipped when clocks go forward) fails the check.
import { z } from "zod";
import { weekdayOfDate, type Weekday } from "@/lib/goals/routine";
import { MAX_TODO_TITLE, MAX_TODOS } from "@/lib/todos/types";
import {
  addDays,
  localDateOf,
  localDateTimeOf,
  localTimeOf,
  parseLocalDateTime,
  startOfLocalDate,
} from "@/lib/time/zoned";

export const MAX_PROPOSALS = 30;
export const MAX_TEXT = 4000;
export const MAX_TITLE = 100;
const MIN_LENGTH_MS = 15 * 60 * 1000;
const MAX_LENGTH_MS = 8 * 60 * 60 * 1000;
/** A moved event keeps edit_event's limit (an event lasts at most 24 hours). */
const MAX_MOVE_MS = 24 * 60 * 60 * 1000;

/**
 * The shape the assistant must answer in (also sent to Claude as the JSON schema, see prompt.ts).
 * `events` is empty for a text answer. Unknown fields are refused.
 */
export const AnswerShape = z
  .object({
    kind: z.enum(["text", "draft"]),
    text: z.string(),
    events: z.array(
      z
        .object({
          title: z.string(),
          start: z.string(),
          end: z.string(),
          goalId: z.string().nullable(),
          /**
           * Spec 21: the event's to-dos. Optional here only so an answer without it (the earlier
           * format) still reads; the schema sent to Claude requires it.
           */
          todos: z.array(z.string()).optional(),
        })
        .strict(),
    ),
    /**
     * Spec 20: moves and deletes of existing events, by reference. Optional here only so an answer
     * without it (step A's format) still reads; the schema sent to Claude requires it.
     */
    changes: z
      .array(
        z
          .object({
            ref: z.string(),
            action: z.enum(["move", "delete"]),
            start: z.string().nullable(),
            end: z.string().nullable(),
          })
          .strict(),
      )
      .optional(),
    /**
     * Spec 23: to-dos for events already in the calendar, by reference. Optional here only so an answer
     * without it (the earlier format) still reads; the schema sent to Claude requires it.
     */
    addTodos: z
      .array(
        z
          .object({
            ref: z.string(),
            todos: z.array(z.string()),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

/** A proposed event with its times as instants, and its to-dos (spec 21; left out when it has none). */
export type Proposal = { title: string; startAt: Date; endAt: Date; goalId: string | null; todos?: string[] };

/**
 * A timed event already in the calendar, as the overlap check needs it. All-day events never block (R29).
 * `id` lets a moved or deleted event stop blocking at its old time.
 */
export type CalendarBlock = { startAt: Date; endAt: Date; mayOverlap: boolean; id?: string };

/** An existing event the coach may change (decision 3 of spec 20), as the server read it. */
export type ChangeTarget = {
  id: string;
  /** The version the draft saw (R4), an ISO string. */
  updatedAt: string;
  title: string;
  goalId: string | null;
  startAt: Date;
  endAt: Date;
  mayOverlap: boolean;
};

/** A checked change: a move to new times (title, goal and everything else stay) or a delete. */
export type Change = { kind: "move"; target: ChangeTarget; startAt: Date; endAt: Date } | { kind: "delete"; target: ChangeTarget };

/**
 * An existing event the coach may add to-dos to (spec 23), as the server read it: its title and times
 * (to show the draft later) and how many to-dos it has now.
 */
export type TodoTarget = {
  id: string;
  title: string;
  allDay: boolean;
  /** A timed event's times; null for an all-day event. */
  startAt: Date | null;
  endAt: Date | null;
  /** An all-day event's days ("2026-11-17"); null for a timed event. */
  firstDay: string | null;
  lastDay: string | null;
  todoCount: number;
};

/** A checked addition of to-dos to an existing event: the event and the new titles, trimmed, in order. */
export type TodoAddition = { target: TodoTarget; todos: string[] };

/** The fields that decide whether the coach may add to-dos to an event (spec 23). */
export type TodoFields = { source: string; allDay: boolean; endAt: Date | null; lastDay: string | null };

/**
 * Decision 2 of spec 23: the coach may add to-dos to the user's own events that are not from Outlook
 * (R11, R40) and have not ended before today, also to events of a series (the to-dos go to that one
 * event), to all-day events and to events that have started.
 */
export function allowsTodos(event: TodoFields, now: Date, timeZone: string): boolean {
  if (event.source === "outlook") return false;
  const today = localDateOf(now, timeZone);
  if (event.allDay) return event.lastDay !== null && event.lastDay >= today;
  return event.endAt !== null && event.endAt > startOfLocalDate(today, timeZone);
}

/** The fields that decide whether the coach may change an event. */
export type ChangeableFields = {
  allDay: boolean;
  source: string;
  seriesId: string | null;
  startAt: Date | null;
  /** Spec 24: the event has guests (only whether; the addresses never come here). */
  hasGuests?: boolean;
};

/**
 * Decision 3 of spec 20: the coach may move or delete the user's own events that are timed, not from
 * Outlook (R11), not part of a series (R28, no scope question in the chat) and not started yet.
 * Spec 24: and that have no guests (they would get update or cancellation mails nobody asked for).
 */
export function isChangeable(event: ChangeableFields, now: Date): boolean {
  return (
    !event.allDay &&
    event.source !== "outlook" &&
    event.seriesId === null &&
    event.hasGuests !== true &&
    event.startAt !== null &&
    event.startAt > now
  );
}

export type CheckContext = {
  now: Date;
  timeZone: string;
  /** The ids of the user's goals. */
  goalIds: ReadonlySet<string>;
  /** The user's timed events around the 14 days (the proposals are checked against them). */
  calendar: readonly CalendarBlock[];
  /**
   * The references of this one request: "e1" -> the event the coach may change, or null for an event
   * it may not change. A reference not in here is unknown. Without it, no change is possible.
   */
  targets?: ReadonlyMap<string, ChangeTarget | null>;
  /**
   * Spec 23: the same references for adding to-dos: "e1" -> the event, or null for an event that takes
   * no to-dos from the coach. Without it, no to-dos can be added to existing events.
   */
  todoTargets?: ReadonlyMap<string, TodoTarget | null>;
  /**
   * Spec 43: goal id -> the weekdays the goal is never done on (Monday = 1), as the goal is now. A goal
   * not in here (or without it at all) has no such days.
   */
  neverDays?: ReadonlyMap<string, readonly Weekday[]>;
  /**
   * The person's visible hours (Settings), e.g. 7 and 22: new and moved events must start and end inside
   * them, on one day. Left out: no such check.
   */
  visibleHours?: { startHour: number; endHour: number };
};

/** Whether an event lies inside the visible hours of its day, in the person's time zone. */
export function insideVisibleHours(startAt: Date, endAt: Date, timeZone: string, hours: { startHour: number; endHour: number }): boolean {
  const minute = (instant: Date) => {
    const [h, m] = localTimeOf(instant, timeZone).split(":").map(Number);
    return h * 60 + m;
  };
  const startDay = localDateOf(startAt, timeZone);
  const start = minute(startAt);
  // Ending exactly at midnight counts as the end of the start's day.
  const endsAtMidnight = localDateOf(endAt, timeZone) === addDays(startDay, 1) && minute(endAt) === 0;
  if (localDateOf(endAt, timeZone) !== startDay && !endsAtMidnight) return false;
  const end = endsAtMidnight ? 24 * 60 : minute(endAt);
  return start >= hours.startHour * 60 && end <= hours.endHour * 60;
}

/** `additions` (spec 23) is left out when the draft adds no to-dos to existing events. */
export type CheckedAnswer =
  | { kind: "text"; text: string }
  | { kind: "draft"; text: string; proposals: Proposal[]; changes: Change[]; additions?: TodoAddition[] };

/** Why an answer failed: for the server log and the tests, never shown to the user. */
export type CheckFailure =
  | "shape"
  | "text_length"
  | "text_with_events"
  | "no_events"
  | "too_many_events"
  | "title_length"
  | "bad_time"
  | "start_in_past"
  | "start_too_late"
  | "end_before_start"
  | "too_short"
  | "too_long"
  | "unknown_goal"
  | "overlaps_proposal"
  | "overlaps_calendar"
  | "unknown_ref"
  | "not_changeable"
  | "changed_twice"
  | "too_many_todos"
  | "todo_title"
  | "todos_not_allowed"
  | "todos_twice"
  | "todos_on_deleted"
  | "no_todos"
  | "todo_list_full"
  | "never_day"
  | "outside_hours";

export type CheckResult<T> = { ok: true; value: T } | { ok: false; failure: CheckFailure };

const fail = (failure: CheckFailure) => ({ ok: false as const, failure });

/** The text of a message or answer: trimmed, 1 to 4,000 characters (counted as the user sees them). */
export function checkText(raw: string): string | null {
  const text = raw.trim();
  const length = [...text].length;
  return length >= 1 && length <= MAX_TEXT ? text : null;
}

/** The latest start a proposal may have: the end of the 14th day from today (on 16 Nov: 30 Nov 24:00). */
export function latestStart(now: Date, timeZone: string): Date {
  return startOfLocalDate(addDays(localDateOf(now, timeZone), 15), timeZone);
}

/** A local date-time that really exists in the zone, as an instant; null otherwise. */
function exactLocal(value: string, timeZone: string): Date | null {
  const instant = parseLocalDateTime(value, timeZone);
  if (!instant) return null;
  // A skipped time (02:30 on the spring clock change) comes back as another wall-clock time.
  return localDateTimeOf(instant, timeZone) === value ? instant : null;
}

const overlaps = (a: { startAt: Date; endAt: Date }, b: { startAt: Date; endAt: Date }) =>
  a.startAt < b.endAt && b.startAt < a.endAt;

/**
 * R23 on proposals whose times are already instants (used by send_message after conversion and by
 * accept_draft on the saved draft): timed only, start from now to the end of the 14th day, start
 * before end, 15 minutes to 8 hours, only the user's goals, no overlap with another proposal or with
 * a timed event that may not overlap, at most 30, title 1 to 100 characters.
 */
export function checkProposals(proposals: readonly Proposal[], context: CheckContext): CheckResult<Proposal[]> {
  const checked = checkDraft(proposals, [], context);
  return checked.ok ? { ok: true, value: checked.value.proposals } : checked;
}

/**
 * R23 extended (spec 20) on a whole draft: new events and changes of existing events, 1 to 30 in all.
 * - Every new event as checkProposals says.
 * - Every changed event is changed at most once and has not started.
 * - A move's new times obey edit_event (end after start, at most 24 hours) and start from now to the
 *   end of the 14th day.
 * - Overlaps are checked on the calendar as it would be after the whole draft: a deleted or moved event
 *   no longer blocks at its old time; new and moved events must not overlap each other (unless both may
 *   overlap) or a remaining timed event that may not overlap (R10).
 * - Spec 23: to-dos for existing events: each event at most once and not one the draft deletes; 1 to
 *   20 titles of 1 to 100 characters after trimming; the event's to-dos now plus the new ones at most 20.
 *   Their times play no part in the overlap check (the event stays where it is, or moves as a change).
 */
export function checkDraft(
  proposals: readonly Proposal[],
  changes: readonly Change[],
  context: CheckContext,
  additions: readonly TodoAddition[] = [],
): CheckResult<{ proposals: Proposal[]; changes: Change[]; additions?: TodoAddition[] }> {
  const total = proposals.length + changes.length + additions.length;
  if (total === 0) return fail("no_events");
  if (total > MAX_PROPOSALS) return fail("too_many_events");
  const latest = latestStart(context.now, context.timeZone);

  // Each event at most once, and none that has started.
  const changedIds = new Set<string>();
  for (const change of changes) {
    if (changedIds.has(change.target.id)) return fail("changed_twice");
    changedIds.add(change.target.id);
    if (change.target.startAt <= context.now) return fail("not_changeable");
  }
  // What stays in the calendar.
  const remaining = context.calendar.filter((event) => event.id === undefined || !changedIds.has(event.id));

  const checked: Proposal[] = [];
  for (const proposal of proposals) {
    const title = proposal.title.trim();
    const titleLength = [...title].length;
    if (titleLength < 1 || titleLength > MAX_TITLE) return fail("title_length");
    if (proposal.startAt < context.now) return fail("start_in_past");
    if (proposal.startAt >= latest) return fail("start_too_late");
    if (proposal.endAt <= proposal.startAt) return fail("end_before_start");
    const length = proposal.endAt.getTime() - proposal.startAt.getTime();
    if (length < MIN_LENGTH_MS) return fail("too_short");
    if (length > MAX_LENGTH_MS) return fail("too_long");
    if (proposal.goalId !== null && !context.goalIds.has(proposal.goalId)) return fail("unknown_goal");
    // Spec 43: never on a weekday the goal is never done on; the start's weekday in the person's zone.
    const never = proposal.goalId === null ? undefined : context.neverDays?.get(proposal.goalId);
    if (never && never.includes(weekdayOfDate(localDateOf(proposal.startAt, context.timeZone)))) return fail("never_day");
    // Never outside the visible hours (Settings), also when the person asked for it.
    if (context.visibleHours && !insideVisibleHours(proposal.startAt, proposal.endAt, context.timeZone, context.visibleHours)) return fail("outside_hours");
    // Spec 21: at most 20 to-dos, each 1 to 100 characters after trimming.
    const todos = (proposal.todos ?? []).map((todo) => todo.trim());
    if (todos.length > MAX_TODOS) return fail("too_many_todos");
    if (todos.some((todo) => [...todo].length < 1 || [...todo].length > MAX_TODO_TITLE)) return fail("todo_title");
    if (checked.some((other) => overlaps(other, proposal))) return fail("overlaps_proposal");
    // R10: ending exactly when the next starts is no overlap. An event that may overlap never blocks.
    if (remaining.some((event) => !event.mayOverlap && overlaps(event, proposal))) return fail("overlaps_calendar");
    const kept: Proposal = { title, startAt: proposal.startAt, endAt: proposal.endAt, goalId: proposal.goalId };
    checked.push(todos.length > 0 ? { ...kept, todos } : kept);
  }

  // Moved events at their new times: against the new events, each other and what stays.
  const placed: { startAt: Date; endAt: Date; mayOverlap: boolean }[] = [];
  for (const change of changes) {
    if (change.kind !== "move") continue;
    if (change.startAt < context.now) return fail("start_in_past");
    if (change.startAt >= latest) return fail("start_too_late");
    if (change.endAt <= change.startAt) return fail("end_before_start");
    if (change.endAt.getTime() - change.startAt.getTime() > MAX_MOVE_MS) return fail("too_long");
    if (context.visibleHours && !insideVisibleHours(change.startAt, change.endAt, context.timeZone, context.visibleHours)) return fail("outside_hours");
    const moved = { startAt: change.startAt, endAt: change.endAt, mayOverlap: change.target.mayOverlap };
    // A new event never may overlap, so it always blocks a moved one.
    if (checked.some((proposal) => overlaps(proposal, moved))) return fail("overlaps_proposal");
    if (placed.some((other) => (!other.mayOverlap || !moved.mayOverlap) && overlaps(other, moved))) return fail("overlaps_proposal");
    if (remaining.some((event) => !event.mayOverlap && overlaps(event, moved))) return fail("overlaps_calendar");
    placed.push(moved);
  }

  // Spec 23: to-dos for events already in the calendar.
  const deletedIds = new Set(changes.filter((c) => c.kind === "delete").map((c) => c.target.id));
  const withTodos = new Set<string>();
  const added: TodoAddition[] = [];
  for (const addition of additions) {
    if (withTodos.has(addition.target.id)) return fail("todos_twice");
    withTodos.add(addition.target.id);
    if (deletedIds.has(addition.target.id)) return fail("todos_on_deleted");
    const todos = addition.todos.map((todo) => todo.trim());
    if (todos.length === 0) return fail("no_todos");
    if (todos.length > MAX_TODOS) return fail("too_many_todos");
    if (todos.some((todo) => [...todo].length < 1 || [...todo].length > MAX_TODO_TITLE)) return fail("todo_title");
    if (addition.target.todoCount + todos.length > MAX_TODOS) return fail("todo_list_full");
    added.push({ target: addition.target, todos });
  }
  return { ok: true, value: { proposals: checked, changes: [...changes], ...(added.length > 0 ? { additions: added } : {}) } };
}

/** The assistant's raw answer (parsed JSON, not trusted) through every check of R23. */
export function checkAnswer(raw: unknown, context: CheckContext): CheckResult<CheckedAnswer> {
  const parsed = AnswerShape.safeParse(raw);
  if (!parsed.success) return fail("shape");
  const answer = parsed.data;
  const rawChanges = answer.changes ?? [];
  const rawTodos = answer.addTodos ?? [];
  const text = checkText(answer.text);
  if (text === null) return fail("text_length");

  if (answer.kind === "text") {
    if (answer.events.length > 0 || rawChanges.length > 0 || rawTodos.length > 0) return fail("text_with_events");
    return { ok: true, value: { kind: "text", text } };
  }

  const total = answer.events.length + rawChanges.length + rawTodos.length;
  if (total === 0) return fail("no_events");
  if (total > MAX_PROPOSALS) return fail("too_many_events");
  const proposals: Proposal[] = [];
  for (const event of answer.events) {
    const startAt = exactLocal(event.start, context.timeZone);
    const endAt = exactLocal(event.end, context.timeZone);
    if (!startAt || !endAt) return fail("bad_time");
    const goalId = event.goalId === "" ? null : event.goalId;
    proposals.push(event.todos && event.todos.length > 0 ? { title: event.title, startAt, endAt, goalId, todos: event.todos } : { title: event.title, startAt, endAt, goalId });
  }

  // A reference is turned back into its event at once; an unknown one fails.
  const changes: Change[] = [];
  for (const raw of rawChanges) {
    const target = context.targets?.get(raw.ref);
    if (target === undefined) return fail("unknown_ref");
    if (target === null) return fail("not_changeable");
    if (raw.action === "delete") {
      if (raw.start !== null || raw.end !== null) return fail("shape");
      changes.push({ kind: "delete", target });
      continue;
    }
    const startAt = raw.start === null ? null : exactLocal(raw.start, context.timeZone);
    const endAt = raw.end === null ? null : exactLocal(raw.end, context.timeZone);
    if (!startAt || !endAt) return fail("bad_time");
    changes.push({ kind: "move", target, startAt, endAt });
  }

  // Spec 23: the same for to-dos for existing events; an event that takes none fails.
  const additions: TodoAddition[] = [];
  for (const raw of rawTodos) {
    const target = context.todoTargets?.get(raw.ref);
    if (target === undefined) return fail("unknown_ref");
    if (target === null) return fail("todos_not_allowed");
    additions.push({ target, todos: raw.todos });
  }

  const checked = checkDraft(proposals, changes, context, additions);
  if (!checked.ok) return checked;
  const { proposals: kept, changes: keptChanges, additions: keptAdditions } = checked.value;
  return { ok: true, value: { kind: "draft", text, proposals: kept, changes: keptChanges, ...(keptAdditions ? { additions: keptAdditions } : {}) } };
}
