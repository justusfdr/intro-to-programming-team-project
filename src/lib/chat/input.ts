// R22: exactly what Claude receives with every message, built in one place. Pure, so the tests can
// check what is in it and what is not.
// Sent: the last 10 messages (an assistant message with its draft's proposed events), the goals with
// deadlines and rules, the events from today to 14 days ahead (title, start, end, may_overlap, all_day),
// R31's totals, the time zone, the current local date and time, and the calendar's visible hours.
// Never sent: email, password, locations, the block list, payment data, tasks, or the id of anything
// except a goal. Each field below is copied by name, so nothing else can slip through.
// Spec 21: an earlier draft's new events carry their to-dos, so "add one more" can be understood. The
// to-dos of events already in the calendar are not sent (R22 keeps what is sent small).
// Spec 22: a draft the person changed by hand (dragging its blocks) is marked "adjusted by the person",
// so Claude builds on it instead of putting its blocks back.
// Spec 23: the coach may add to-dos to events already in the calendar. Each event in the block says
// how many to-dos it has ("todoCount", the count only, never the titles; left out when none) and, when
// the coach may not add any ("canAddTodos": false, an Outlook event), says so; an earlier draft carries
// the to-dos it adds to existing events in words (the event's title and the to-dos).
// Spec 20: each event in the block carries a short reference ("e1") that is valid for this one request
// only, and whether the coach may change it; an earlier draft carries its changes in words (title, old
// and new time), never an event's id.
import type { ChatTotals } from "./totals";
import { addDays, localDateOf, localDateTimeOf, startOfLocalDate } from "@/lib/time/zoned";
import type { ChatRole, DraftStatus } from "./types";

export const HISTORY_LENGTH = 10;
export const DAYS_AHEAD = 14;

/** An earlier draft's change of an existing event, as words: what it was and where it went. */
export type HistoryChange = { kind: "move" | "delete"; title: string; oldStartAt: Date; oldEndAt: Date; startAt: Date | null; endAt: Date | null };

export type HistoryInput = {
  role: ChatRole;
  text: string;
  draft: {
    status: DraftStatus;
    /** Spec 22: the person changed the draft's times by hand before it was applied or replaced. */
    adjusted?: boolean;
    events: { title: string; startAt: Date; endAt: Date; goalId: string | null; todos?: string[] }[];
    changes?: HistoryChange[];
    /** Spec 23: to-dos the draft adds to events already in the calendar. */
    addedTodos?: { title: string; todos: string[] }[];
  } | null;
};

export type GoalInput = {
  id: string;
  title: string;
  deadline: string;
  rules: { kind: "count" | "hours"; target: number; minMinutes: number | null }[];
};

/**
 * `ref` and `changeable` (spec 20) are set by the server for every event it reads; they are sent only
 * when present. `canAddTodos` and `todoCount` (spec 23) likewise: the flag is sent only when the coach
 * may not add to-dos (false), the count only when the event has to-dos.
 */
export type CalendarInput = (
  | { allDay: false; title: string; startAt: Date; endAt: Date; mayOverlap: boolean }
  | { allDay: true; title: string; firstDay: string; lastDay: string; mayOverlap: boolean }
) & { ref?: string; changeable?: boolean; canAddTodos?: boolean; todoCount?: number };

export type AssistantInputSource = {
  now: Date;
  timeZone: string;
  dayStartHour: number;
  dayEndHour: number;
  /** Oldest first; only the last 10 are sent. */
  history: readonly HistoryInput[];
  goals: readonly GoalInput[];
  calendar: readonly CalendarInput[];
  totals: ChatTotals;
  /** The user's new message, already checked. */
  message: string;
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function weekdayOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

const sortKey = (e: { allDay: true; firstDay: string } | { allDay: false; start: string }) => (e.allDay ? e.firstDay : e.start);

/** The data block of the user turn. */
export function buildAssistantInput(source: AssistantInputSource) {
  const { now, timeZone } = source;
  const local = (instant: Date) => localDateTimeOf(instant, timeZone);
  const today = localDateOf(now, timeZone);
  const lastDay = addDays(today, DAYS_AHEAD);
  const from = startOfLocalDate(today, timeZone);
  const until = startOfLocalDate(addDays(lastDay, 1), timeZone);

  const events = source.calendar
    .filter((e) => (e.allDay ? e.lastDay >= today && e.firstDay <= lastDay : e.startAt < until && e.endAt > from))
    .map((e) => ({
      ...(e.ref !== undefined ? { ref: e.ref, changeable: e.changeable === true } : {}),
      ...(e.ref !== undefined && e.canAddTodos === false ? { canAddTodos: false as const } : {}),
      ...(e.allDay
        ? { title: e.title, allDay: true as const, firstDay: e.firstDay, lastDay: e.lastDay, mayOverlap: e.mayOverlap }
        : { title: e.title, allDay: false as const, start: local(e.startAt), end: local(e.endAt), mayOverlap: e.mayOverlap }),
      ...(typeof e.todoCount === "number" && e.todoCount > 0 ? { todoCount: e.todoCount } : {}),
    }))
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  return {
    now: local(now),
    today,
    weekday: weekdayOf(today),
    timeZone,
    dayStartHour: source.dayStartHour,
    dayEndHour: source.dayEndHour,
    lastDayForProposals: lastDay,
    goals: source.goals.map((g) => ({
      id: g.id,
      title: g.title,
      deadline: g.deadline,
      rules: g.rules.map((r) => ({ kind: r.kind, target: r.target, minMinutes: r.minMinutes })),
    })),
    events,
    totals: source.totals,
    history: source.history.slice(-HISTORY_LENGTH).map((m) => ({
      role: m.role,
      text: m.text,
      ...(m.draft
        ? {
            draftStatus: m.draft.status,
            ...(m.draft.adjusted ? { draftNote: "adjusted by the person" as const } : {}),
            proposedEvents: m.draft.events.map((e) => ({
              title: e.title,
              start: local(e.startAt),
              end: local(e.endAt),
              goalId: e.goalId,
              ...(e.todos && e.todos.length > 0 ? { todos: e.todos } : {}),
            })),
            ...(m.draft.changes && m.draft.changes.length > 0
              ? {
                  changes: m.draft.changes.map((c) =>
                    c.kind === "move" && c.startAt && c.endAt
                      ? { change: "move" as const, title: c.title, from: local(c.oldStartAt), fromEnd: local(c.oldEndAt), to: local(c.startAt), toEnd: local(c.endAt) }
                      : { change: "delete" as const, title: c.title, start: local(c.oldStartAt), end: local(c.oldEndAt) },
                  ),
                }
              : {}),
            ...(m.draft.addedTodos && m.draft.addedTodos.length > 0
              ? { addedTodos: m.draft.addedTodos.map((a) => ({ title: a.title, todos: [...a.todos] })) }
              : {}),
          }
        : {}),
    })),
    message: source.message,
  };
}

export type AssistantInput = ReturnType<typeof buildAssistantInput>;
