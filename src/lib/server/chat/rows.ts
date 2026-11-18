import "server-only";

// Reading and writing the coach's rows (spec 19), always inside withUser, so row-level security limits
// every statement to the signed-in user (R3).
import {
  allowsTodos,
  isChangeable,
  type CalendarBlock,
  type Change,
  type ChangeTarget,
  type Proposal,
  type TodoAddition,
  type TodoTarget,
} from "@/lib/chat/checks";
import { goalWeeks, type GoalEvent } from "@/lib/chat/goal-weeks";
import type { CalendarInput, GoalInput, HistoryInput } from "@/lib/chat/input";
import { totalsWindow, type DoneEventInput, type SessionInput } from "@/lib/chat/totals";
import { chatTitleOf } from "@/lib/chat/chats";
import { excerptOf, likePatterns, SEARCH_RESULTS } from "@/lib/chat/search";
import type {
  ChatMessageDto,
  ChatRole,
  ChatSummaryDto,
  DraftChangeDto,
  DraftDto,
  DraftStatus,
  DraftTodosDto,
  ProposedEventDto,
} from "@/lib/chat/types";
import type { Plan } from "@/lib/chat/access";
import { focusedMinutes } from "@/lib/focus/session-time";
import type { Weekday } from "@/lib/goals/routine";
import { MESSAGES } from "@/lib/messages";
import type { Query } from "@/lib/server/db";
import { ActionError } from "@/lib/server/errors";
import { notFound } from "@/lib/server/events/own-event";
import { timesOf, type SessionRow } from "@/lib/server/focus/sessions";
import { readGoals } from "@/lib/server/goals/rows";
import { addDays, localDateOf, startOfLocalDate } from "@/lib/time/zoned";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A proposed event as the database keeps it in draft_plans.proposed_events. `todos` (spec 21): its
 * to-dos' titles, only when it has some (app.chat_apply_draft writes them with the event).
 */
type StoredProposal = { title: string; start_at: string; end_at: string; goal_id: string | null; todos?: string[] };

/** The to-dos of a proposal as a field to spread: left out when there are none. */
const todosField = (todos: readonly string[] | undefined) => (todos && todos.length > 0 ? { todos: [...todos] } : {});

/**
 * A change of an existing event as the database keeps it in draft_plans.changes (spec 20): the event's
 * id and the version the draft saw (R4), what it was (title, goal, old times, to show the draft later)
 * and, for a move, the new times.
 */
type StoredChange = {
  kind: "move" | "delete";
  event_id: string;
  updated_at: string;
  title: string;
  goal_id: string | null;
  old_start_at: string;
  old_end_at: string;
  start_at: string | null;
  end_at: string | null;
};

/**
 * To-dos for an event already in the calendar as the database keeps them in draft_plans.added_todos
 * (spec 23): the event's id, its title and times as the draft saw them (to show the draft later; a
 * timed event has start_at and end_at, an all-day one first_day and last_day), and the new titles.
 */
type StoredAddition = {
  event_id: string;
  title: string;
  all_day: boolean;
  start_at: string | null;
  end_at: string | null;
  first_day: string | null;
  last_day: string | null;
  todos: string[];
};

type MessageRow = {
  id: string;
  role: ChatRole;
  text: string;
  created_at: Date;
  draft_id: string | null;
  draft_status: DraftStatus | null;
  proposed_events: StoredProposal[] | string | null;
  changes: StoredChange[] | string | null;
  /** Spec 22: 0 as the assistant wrote the draft, one more for each change by the person. */
  draft_version: number | null;
  /** Spec 23: to-dos for events already in the calendar. */
  added_todos: StoredAddition[] | string | null;
};

const MESSAGE_SELECT = `select m.id, m.role, m.text, m.created_at, d.id as draft_id, d.status as draft_status, d.proposed_events, d.changes,
       d.version as draft_version, d.added_todos
  from app.chat_messages m left join app.draft_plans d on d.message_id = m.id`;

// The driver may hand JSON over as text.
const storedOf = (value: StoredProposal[] | string | null): StoredProposal[] =>
  value === null ? [] : typeof value === "string" ? (JSON.parse(value) as StoredProposal[]) : value;

const storedChangesOf = (value: StoredChange[] | string | null | undefined): StoredChange[] =>
  value === null || value === undefined ? [] : typeof value === "string" ? (JSON.parse(value) as StoredChange[]) : value;

const storedAdditionsOf = (value: StoredAddition[] | string | null | undefined): StoredAddition[] =>
  value === null || value === undefined ? [] : typeof value === "string" ? (JSON.parse(value) as StoredAddition[]) : value;

export function toStoredAdditions(additions: readonly TodoAddition[]): StoredAddition[] {
  return additions.map((a) => ({
    event_id: a.target.id,
    title: a.target.title,
    all_day: a.target.allDay,
    start_at: a.target.startAt ? a.target.startAt.toISOString() : null,
    end_at: a.target.endAt ? a.target.endAt.toISOString() : null,
    first_day: a.target.firstDay,
    last_day: a.target.lastDay,
    todos: [...a.todos],
  }));
}

const additionDto = (a: StoredAddition): DraftTodosDto => ({
  eventId: a.event_id,
  title: a.title,
  allDay: a.all_day === true,
  startAt: a.start_at ? new Date(a.start_at).toISOString() : null,
  endAt: a.end_at ? new Date(a.end_at).toISOString() : null,
  firstDay: a.first_day ?? null,
  lastDay: a.last_day ?? null,
  todos: [...a.todos],
});

export function toStoredChanges(changes: readonly Change[]): StoredChange[] {
  return changes.map((c) => ({
    kind: c.kind,
    event_id: c.target.id,
    updated_at: c.target.updatedAt,
    title: c.target.title,
    goal_id: c.target.goalId,
    old_start_at: c.target.startAt.toISOString(),
    old_end_at: c.target.endAt.toISOString(),
    start_at: c.kind === "move" ? c.startAt.toISOString() : null,
    end_at: c.kind === "move" ? c.endAt.toISOString() : null,
  }));
}

const changeDto = (c: StoredChange): DraftChangeDto => ({
  kind: c.kind,
  eventId: c.event_id,
  title: c.title,
  goalId: c.goal_id ?? null,
  oldStartAt: new Date(c.old_start_at).toISOString(),
  oldEndAt: new Date(c.old_end_at).toISOString(),
  startAt: c.start_at === null ? null : new Date(c.start_at).toISOString(),
  endAt: c.end_at === null ? null : new Date(c.end_at).toISOString(),
});

export function toStored(proposals: readonly Proposal[]): StoredProposal[] {
  return proposals.map((p) => ({
    title: p.title,
    start_at: p.startAt.toISOString(),
    end_at: p.endAt.toISOString(),
    goal_id: p.goalId,
    ...todosField(p.todos),
  }));
}

export function proposalsOf(value: StoredProposal[] | string | null): Proposal[] {
  return storedOf(value).map((p) => ({
    title: p.title,
    startAt: new Date(p.start_at),
    endAt: new Date(p.end_at),
    goalId: p.goal_id ?? null,
    ...todosField(p.todos),
  }));
}

const proposedDto = (p: Proposal): ProposedEventDto => ({
  title: p.title,
  startAt: p.startAt.toISOString(),
  endAt: p.endAt.toISOString(),
  goalId: p.goalId,
  ...todosField(p.todos),
});

function toMessageDto(row: MessageRow): ChatMessageDto {
  const added = storedAdditionsOf(row.added_todos).map(additionDto);
  const draft: DraftDto | null =
    row.draft_id && row.draft_status
      ? {
          id: row.draft_id,
          status: row.draft_status,
          events: proposalsOf(row.proposed_events).map(proposedDto),
          changes: storedChangesOf(row.changes).map(changeDto),
          version: row.draft_version ?? 0,
          // Spec 23: only when the draft adds to-dos to existing events.
          ...(added.length > 0 ? { addedTodos: added } : {}),
        }
      : null;
  return { id: row.id, role: row.role, text: row.text, createdAt: new Date(row.created_at).toISOString(), draft };
}

/** The latest `limit` messages of one chat (spec 44) with their drafts, oldest first. */
export async function readMessages(query: Query, chatId: string, limit: number): Promise<ChatMessageDto[]> {
  const rows = await query<MessageRow>(`${MESSAGE_SELECT} where m.chat_id = $1 order by m.seq desc limit $2`, [chatId, limit]);
  return rows.reverse().map(toMessageDto);
}

type ChatRow = { id: string; title: string; updated_at: string | Date };

const toChatDto = (row: ChatRow): ChatSummaryDto => ({ id: row.id, title: row.title, updatedAt: new Date(row.updated_at).toISOString() });

/** The user's latest `limit` chats (spec 44), newest first. */
export async function readChats(query: Query, limit: number): Promise<ChatSummaryDto[]> {
  const rows = await query<ChatRow>("select id, title, updated_at from app.chats order by updated_at desc, id limit $1", [limit]);
  return rows.map(toChatDto);
}

/** The user's latest chat (by its latest message), or null when they have none. */
export async function latestChat(query: Query): Promise<ChatSummaryDto | null> {
  const [row] = await query<ChatRow>("select id, title, updated_at from app.chats order by updated_at desc, id limit 1");
  return row ? toChatDto(row) : null;
}

/** The user's chat with this id, or null (another user's chat is not visible, R3; an id that is no id is none). */
export async function findOwnChat(query: Query, id: string): Promise<ChatSummaryDto | null> {
  if (!UUID.test(id)) return null;
  const [row] = await query<ChatRow>("select id, title, updated_at from app.chats where id = $1", [id]);
  return row ? toChatDto(row) : null;
}

/** One chat found by a search (spec 44): the first message with every word, and an excerpt around the hit. */
export type ChatSearchResult = { chat: ChatSummaryDto; messageId: string | null; excerpt: string | null };

/**
 * The user's chats whose title or one of whose messages contains every word (ignoring case), newest
 * first, at most 30 (spec 44). Row-level security keeps it to the user's own chats (R3). For each chat
 * the first message with all the words, and a short excerpt around the hit; a chat found only by its
 * title has none.
 */
export async function searchOwnChats(query: Query, words: readonly string[]): Promise<ChatSearchResult[]> {
  const rows = await query<ChatRow & { message_id: string | null; message_text: string | null }>(
    `select c.id, c.title, c.updated_at, m.id as message_id, m.text as message_text
       from app.chats c
       left join lateral (
         select m.id, m.text
           from app.chat_messages m
          where m.chat_id = c.id and m.text ilike all ($1::text[])
          order by m.seq
          limit 1
       ) m on true
      where m.id is not null or c.title ilike all ($1::text[])
      order by c.updated_at desc, c.id
      limit $2`,
    [likePatterns(words), SEARCH_RESULTS],
  );
  return rows.map((row) => ({
    chat: toChatDto(row),
    messageId: row.message_id,
    excerpt: row.message_text === null ? null : excerptOf(row.message_text, words),
  }));
}

/** "This chat no longer exists": the chat was deleted (or is not the user's). */
export const chatGone = () => new ActionError(404, "chat_gone", MESSAGES.chatGone);

/** The same as what Claude receives as history (R22). */
export function historyOf(messages: readonly ChatMessageDto[]): HistoryInput[] {
  return messages.map((m) => ({
    role: m.role,
    text: m.text,
    draft: m.draft
      ? {
          status: m.draft.status,
          // Spec 22: the person changed this draft by hand; Claude builds on it.
          ...((m.draft.version ?? 0) > 0 ? { adjusted: true } : {}),
          events: m.draft.events.map((e) => ({
            title: e.title,
            startAt: new Date(e.startAt),
            endAt: new Date(e.endAt),
            goalId: e.goalId,
            ...todosField(e.todos),
          })),
          changes: m.draft.changes.map((c) => ({
            kind: c.kind,
            title: c.title,
            oldStartAt: new Date(c.oldStartAt),
            oldEndAt: new Date(c.oldEndAt),
            startAt: c.startAt === null ? null : new Date(c.startAt),
            endAt: c.endAt === null ? null : new Date(c.endAt),
          })),
          // Spec 23: in words, the event's title and the to-dos.
          ...(m.draft.addedTodos && m.draft.addedTodos.length > 0
            ? { addedTodos: m.draft.addedTodos.map((a) => ({ title: a.title, todos: [...a.todos] })) }
            : {}),
        }
      : null,
  }));
}

/** The user's plan (R21). Spec 44: there is no daily limit any more, so nothing is counted. */
export async function readChatAccount(query: Query): Promise<{ plan: Plan }> {
  const [row] = await query<{ plan: Plan }>("select plan from app.profiles where id = (select auth.uid())");
  return { plan: row?.plan ?? "free" };
}

/**
 * The window of the calendar the coach looks at: from today 00:00 to the end of the 15th day. Proposals
 * start at the latest at the end of the 14th day and last at most 8 hours, so every event they could
 * overlap lies inside.
 */
export function calendarWindow(now: Date, timeZone: string) {
  const today = localDateOf(now, timeZone);
  return {
    today,
    lastDay: addDays(today, 15),
    from: startOfLocalDate(today, timeZone),
    until: startOfLocalDate(addDays(today, 16), timeZone),
  };
}

type CalendarRow = {
  id: string;
  title: string;
  all_day: boolean;
  start_at: Date | null;
  end_at: Date | null;
  first_day: string | null;
  last_day: string | null;
  may_overlap: boolean;
  goal_id: string | null;
  series_id: string | null;
  source: string;
  updated_at: Date;
  /** Spec 23: how many to-dos the event has (the count only). */
  todo_count: number;
  /** Spec 24: whether it has guests (never the addresses). */
  has_guests: boolean;
  /** Spec 43: "planned" or "done", for the sessions of a goal still planned. Never sent to Claude. */
  status: string;
};

/**
 * An event of the window as the server knows it: what R22 lets Claude see, plus what only the server
 * keeps (the id, the version, the goal, the source and the series) to turn a reference in the answer
 * back into the event (spec 20). buildAssistantInput copies only the allowed fields.
 */
export type CalendarEntry = CalendarInput & {
  id: string;
  updatedAt: string;
  goalId: string | null;
  source: string;
  seriesId: string | null;
  /** Spec 23: how many to-dos the event has now (the count only; the titles are never read here). */
  todoCount: number;
  /** Spec 24: whether the event has guests (the coach may not move or delete it). Never sent to Claude. */
  hasGuests?: boolean;
  /** Spec 43: "planned" or "done", to count a goal's sessions still planned (R45). Never sent to Claude. */
  status?: string;
};

/**
 * The user's events in the window, each with the number of its to-dos (spec 23). No location is read,
 * and of the guests only whether there are any (spec 24).
 */
export async function readCalendar(query: Query, now: Date, timeZone: string): Promise<CalendarEntry[]> {
  const w = calendarWindow(now, timeZone);
  const rows = await query<CalendarRow>(
    `select e.id, e.title, e.all_day, e.start_at, e.end_at, e.first_day::text as first_day, e.last_day::text as last_day,
            e.may_overlap, e.goal_id, e.series_id, e.source, e.updated_at,
            (select count(*) from app.event_todos t where t.event_id = e.id)::integer as todo_count,
            coalesce(cardinality(e.guests), 0) > 0 as has_guests,
            e.status
       from app.events e
      where (not e.all_day and e.end_at > $1::timestamptz and e.start_at < $2::timestamptz)
         or (e.all_day and e.last_day >= $3::date and e.first_day <= $4::date)
      order by coalesce(e.start_at, e.first_day::timestamptz), e.id`,
    [w.from, w.until, w.today, w.lastDay],
  );
  return rows.map((r) => {
    const own = {
      id: r.id,
      updatedAt: new Date(r.updated_at).toISOString(),
      goalId: r.goal_id,
      source: r.source,
      seriesId: r.series_id,
      todoCount: Number(r.todo_count ?? 0),
      hasGuests: r.has_guests === true,
      status: r.status,
    };
    return r.all_day
      ? { ...own, allDay: true as const, title: r.title, firstDay: r.first_day!, lastDay: r.last_day!, mayOverlap: r.may_overlap }
      : { ...own, allDay: false as const, title: r.title, startAt: new Date(r.start_at!), endAt: new Date(r.end_at!), mayOverlap: r.may_overlap };
  });
}

/** Spec 23, decision 2: whether the coach may add to-dos to this event. */
function takesTodos(e: CalendarEntry, now: Date, timeZone: string): boolean {
  return allowsTodos(
    { source: e.source, allDay: e.allDay, endAt: e.allDay ? null : e.endAt, lastDay: e.allDay ? e.lastDay : null },
    now,
    timeZone,
  );
}

/**
 * Spec 20, decision 2: gives every event a reference valid for this one request ("e1", "e2", … in
 * calendar order) and whether the coach may change it (decision 3). Spec 23: and whether it may add
 * to-dos to it.
 */
export function withReferences(calendar: readonly CalendarEntry[], now: Date, timeZone: string): CalendarEntry[] {
  return calendar.map((e, i) => ({
    ...e,
    ref: `e${i + 1}`,
    changeable: isChangeable(
      { allDay: e.allDay, source: e.source, seriesId: e.seriesId, startAt: e.allDay ? null : e.startAt, hasGuests: e.hasGuests },
      now,
    ),
    canAddTodos: takesTodos(e, now, timeZone),
  }));
}

/** An event the coach may add to-dos to, as the checks take it (spec 23). */
function todoTargetOf(e: CalendarEntry): TodoTarget {
  return e.allDay
    ? { id: e.id, title: e.title, allDay: true, startAt: null, endAt: null, firstDay: e.firstDay, lastDay: e.lastDay, todoCount: e.todoCount }
    : { id: e.id, title: e.title, allDay: false, startAt: e.startAt, endAt: e.endAt, firstDay: null, lastDay: null, todoCount: e.todoCount };
}

/** Spec 23: the references of this request for adding to-dos: "e1" -> the event, or null when it takes none. */
export function todoTargetsOf(calendar: readonly CalendarEntry[]): Map<string, TodoTarget | null> {
  return new Map(calendar.filter((e) => e.ref !== undefined).map((e) => [e.ref!, e.canAddTodos ? todoTargetOf(e) : null]));
}

/**
 * accept_draft and edit_draft (spec 23): the saved to-dos for existing events against the calendar as
 * it is now. Each event must still be in the calendar's window and still take to-dos from the coach;
 * it need not be unchanged (decision 5), and the count of its to-dos is the one of now. Otherwise null
 * ("This draft is out of date").
 */
export function currentAdditions(
  stored: StoredAddition[] | string | null | undefined,
  calendar: readonly CalendarEntry[],
  now: Date,
  timeZone: string,
): TodoAddition[] | null {
  const additions: TodoAddition[] = [];
  for (const a of storedAdditionsOf(stored)) {
    const event = calendar.find((e) => e.id === a.event_id);
    if (!event || !takesTodos(event, now, timeZone) || !Array.isArray(a.todos)) return null;
    additions.push({ target: todoTargetOf(event), todos: [...a.todos] });
  }
  return additions;
}

/** An event the coach may change, as the checks take it. */
function targetOf(e: CalendarEntry): ChangeTarget | null {
  if (e.allDay) return null;
  return { id: e.id, updatedAt: e.updatedAt, title: e.title, goalId: e.goalId, startAt: e.startAt, endAt: e.endAt, mayOverlap: e.mayOverlap };
}

/** The references of this request: "e1" -> the event, or null when the coach may not change it. */
export function targetsOf(calendar: readonly CalendarEntry[]): Map<string, ChangeTarget | null> {
  return new Map(calendar.filter((e) => e.ref !== undefined).map((e) => [e.ref!, e.changeable ? targetOf(e) : null]));
}

/**
 * accept_draft (spec 20): the saved changes against the calendar as it is now. Each changed event must
 * still be there with the version the draft saw (R4) and still be one the coach may change; otherwise
 * null ("This draft is out of date").
 */
export function currentChanges(stored: StoredChange[] | string | null | undefined, calendar: readonly CalendarEntry[], now: Date): Change[] | null {
  const changes: Change[] = [];
  for (const c of storedChangesOf(stored)) {
    const event = calendar.find((e) => e.id === c.event_id);
    if (!event || event.allDay || event.updatedAt !== new Date(c.updated_at).toISOString()) return null;
    const changeable = isChangeable(
      { allDay: false, source: event.source, seriesId: event.seriesId, startAt: event.startAt, hasGuests: event.hasGuests },
      now,
    );
    const target = changeable ? targetOf(event) : null;
    if (!target) return null;
    if (c.kind === "delete") changes.push({ kind: "delete", target });
    else if (c.start_at && c.end_at) changes.push({ kind: "move", target, startAt: new Date(c.start_at), endAt: new Date(c.end_at) });
    else return null;
  }
  return changes;
}

/** The timed events among them, as the overlap check of R23 takes them (with the id, spec 20). */
export function blocksOf(calendar: readonly CalendarEntry[]): CalendarBlock[] {
  return calendar.flatMap((e) => (e.allDay ? [] : [{ id: e.id, startAt: e.startAt, endAt: e.endAt, mayOverlap: e.mayOverlap }]));
}

/**
 * The goals with deadlines and rules (R22). Spec 43: with `routines`, also the routine of a goal that
 * has one (send_message asks for it); without, exactly as before spec 43. Which of the routine's fields
 * reach Claude is decided by buildAssistantInput (never the location itself).
 */
export async function readGoalInputs(query: Query, options: { routines?: boolean } = {}): Promise<GoalInput[]> {
  const goals = await readGoals(query);
  return goals.map(({ goal }) => ({
    id: goal.id,
    title: goal.title,
    deadline: goal.deadline,
    rules: goal.rules.map((r) => ({ kind: r.kind, target: r.target, minMinutes: r.minMinutes })),
    ...(options.routines && goal.routine ? { routine: goal.routine } : {}),
  }));
}

/**
 * Spec 43 (R45): each goal with a routine gets its sessions left this week and next. The done events
 * are R31's (readTotalsInput); the planned ones are the timed events of the calendar read that are not
 * done. A goal without a routine is returned unchanged.
 */
export function withGoalWeeks(
  goals: readonly GoalInput[],
  doneEvents: readonly GoalEvent[],
  calendar: readonly CalendarEntry[],
  now: Date,
  timeZone: string,
): GoalInput[] {
  const planned: GoalEvent[] = calendar.flatMap((e) =>
    e.allDay || e.status === "done" ? [] : [{ goalId: e.goalId, startAt: e.startAt, endAt: e.endAt }],
  );
  return goals.map((g) =>
    g.routine
      ? {
          ...g,
          weeks: goalWeeks({
            goal: { id: g.id, deadline: g.deadline, rules: g.rules, sessionMinutes: g.routine.sessionMinutes },
            done: doneEvents,
            planned,
            now,
            timeZone,
          }),
        }
      : g,
  );
}

/** Spec 43: goal id -> the weekdays it is never done on, for the checks of R23 (only goals with some). */
export function neverDaysOf(goals: readonly { id: string; routine?: { avoidDays: readonly Weekday[] } }[]): Map<string, readonly Weekday[]> {
  return new Map(goals.flatMap((g) => (g.routine && g.routine.avoidDays.length > 0 ? [[g.id, [...g.routine.avoidDays]] as const] : [])));
}

/**
 * Spec 43: the goals with their routines as they are now, for accept_draft and edit_draft: the ids (a
 * deleted goal makes a draft out of date), the never days, and the place of each goal that has one.
 */
export async function readGoalRoutines(query: Query): Promise<{ goalIds: Set<string>; neverDays: Map<string, readonly Weekday[]>; places: Map<string, string> }> {
  const goals = await readGoals(query);
  const routines = goals.map(({ goal }) => ({ id: goal.id, routine: goal.routine }));
  return {
    goalIds: new Set(routines.map((g) => g.id)),
    neverDays: neverDaysOf(routines),
    places: new Map(routines.flatMap((g) => (g.routine?.location ? [[g.id, g.routine.location] as const] : []))),
  };
}

/** What R31's totals are added up from: done timed events and finished sessions of the 8 weeks. */
export async function readTotalsInput(
  query: Query,
  now: Date,
  timeZone: string,
): Promise<{ doneEvents: DoneEventInput[]; sessions: SessionInput[] }> {
  const { from, until } = totalsWindow(now, timeZone);
  const [events, sessions] = await Promise.all([
    query<{ title: string; goal_id: string | null; start_at: Date; end_at: Date }>(
      `select title, goal_id, start_at, end_at from app.events
        where status = 'done' and not all_day and start_at >= $1 and start_at < $2`,
      [from, until],
    ),
    query<SessionRow>(
      `select s.id, s.event_id, null as event_title, e.goal_id as event_goal_id, s.planned_minutes, s.status, s.started_at,
              s.paused_at, s.paused_seconds, s.ended_at, s.rating
         from app.focus_sessions s left join app.events e on e.id = s.event_id
        where s.status = 'finished' and s.started_at >= $1 and s.started_at < $2`,
      [from, until],
    ),
  ]);
  return {
    doneEvents: events.map((e) => ({ title: e.title, goalId: e.goal_id, startAt: new Date(e.start_at), endAt: new Date(e.end_at) })),
    sessions: sessions.map((s) => ({
      startedAt: new Date(s.started_at),
      focusedMinutes: focusedMinutes(timesOf(s), now),
      goalId: s.event_goal_id,
    })),
  };
}

/**
 * Saves a checked answer together with the user's message (decision 2: one transaction). A draft
 * answer turns the older open draft "replaced" and becomes the one open draft. The lock makes two
 * answers of one user that arrive at the same moment take turns, so the second one replaces the first
 * one's draft instead of colliding with it.
 */
export async function saveTurn(
  query: Query,
  chatId: string | null,
  userText: string,
  answer: { text: string; proposals: readonly Proposal[] | null; changes?: readonly Change[]; additions?: readonly TodoAddition[] },
): Promise<{ chat: ChatSummaryDto; messages: ChatMessageDto[] }> {
  await query("select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('chat:' || auth.uid()::text))");
  // Spec 44: the turn goes into its chat; a chat deleted since the message was sent saves nothing (R1).
  // delete_chat takes the same lock, so a delete on another device waits for this turn or comes first.
  // Without a chat the turn starts a new one, titled with the user's message.
  let chat: string;
  if (chatId !== null) {
    const own = await findOwnChat(query, chatId);
    if (!own) throw chatGone();
    chat = own.id;
  } else {
    const [made] = await query<{ id: string }>("insert into app.chats (title) values ($1) returning id", [chatTitleOf(userText)]);
    chat = made.id;
  }
  if (answer.proposals) await query("update app.draft_plans set status = 'replaced' where status = 'open'");
  const [user] = await query<{ id: string }>("insert into app.chat_messages (chat_id, role, text) values ($1::uuid, 'user', $2) returning id", [
    chat,
    userText,
  ]);
  const [assistant] = await query<{ id: string }>(
    "insert into app.chat_messages (chat_id, role, text) values ($1::uuid, 'assistant', $2) returning id",
    [chat, answer.text],
  );
  if (answer.proposals) {
    // $2::text::jsonb, not $2::jsonb: the real database driver encodes a parameter it knows to be jsonb
    // as JSON itself, so an already encoded string would be saved as one JSON string, not as a list.
    // As text it arrives unchanged and the database turns it into jsonb.
    // The same for the changes (spec 20) and the to-dos for existing events (spec 23).
    await query(
      "insert into app.draft_plans (message_id, proposed_events, changes, added_todos) values ($1::uuid, $2::text::jsonb, $3::text::jsonb, $4::text::jsonb)",
      [
        assistant.id,
        JSON.stringify(toStored(answer.proposals)),
        JSON.stringify(toStoredChanges(answer.changes ?? [])),
        JSON.stringify(toStoredAdditions(answer.additions ?? [])),
      ],
    );
  }
  const rows = await query<MessageRow>(`${MESSAGE_SELECT} where m.id = any($1::uuid[]) order by m.seq`, [[user.id, assistant.id]]);
  const saved = await findOwnChat(query, chat);
  return { chat: saved!, messages: rows.map(toMessageDto) };
}

export type DraftRow = {
  id: string;
  status: DraftStatus;
  /** Spec 22: the draft's version (R4). */
  version: number;
  proposed_events: StoredProposal[] | string;
  changes: StoredChange[] | string;
  /** Spec 23: to-dos for events already in the calendar. */
  added_todos: StoredAddition[] | string;
};

/** The user's draft, locked until the transaction ends (a second device waits). "Not found" otherwise (R3). */
export async function findOwnDraft(query: Query, id: string): Promise<DraftRow> {
  if (!UUID.test(id)) throw notFound();
  const [row] = await query<DraftRow>("select id, status, version, proposed_events, changes, added_todos from app.draft_plans where id = $1 for update", [id]);
  if (!row) throw notFound();
  return row;
}

/** One draft with its message's other fields left out, as the page shows it (spec 22: after a change). */
export async function readDraft(query: Query, id: string): Promise<DraftDto | null> {
  const [row] = await query<MessageRow>(`${MESSAGE_SELECT} where d.id = $1`, [id]);
  return row ? toMessageDto(row).draft : null;
}

export function assertDraftOpen(draft: DraftRow): void {
  if (draft.status !== "open") throw new ActionError(409, "draft_not_open", MESSAGES.draftNotOpen);
}
