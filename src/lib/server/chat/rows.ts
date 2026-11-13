import "server-only";

// Reading and writing the coach's rows (spec 19), always inside withUser, so row-level security limits
// every statement to the signed-in user (R3).
import { isChangeable, type CalendarBlock, type Change, type ChangeTarget, type Proposal } from "@/lib/chat/checks";
import type { CalendarInput, GoalInput, HistoryInput } from "@/lib/chat/input";
import { totalsWindow, type DoneEventInput, type SessionInput } from "@/lib/chat/totals";
import type { ChatMessageDto, ChatRole, DraftChangeDto, DraftDto, DraftStatus, ProposedEventDto } from "@/lib/chat/types";
import type { Plan } from "@/lib/chat/access";
import { focusedMinutes } from "@/lib/focus/session-time";
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

type MessageRow = {
  id: string;
  role: ChatRole;
  text: string;
  created_at: Date;
  draft_id: string | null;
  draft_status: DraftStatus | null;
  proposed_events: StoredProposal[] | string | null;
  changes: StoredChange[] | string | null;
};

const MESSAGE_SELECT = `select m.id, m.role, m.text, m.created_at, d.id as draft_id, d.status as draft_status, d.proposed_events, d.changes
  from app.chat_messages m left join app.draft_plans d on d.message_id = m.id`;

// The driver may hand JSON over as text.
const storedOf = (value: StoredProposal[] | string | null): StoredProposal[] =>
  value === null ? [] : typeof value === "string" ? (JSON.parse(value) as StoredProposal[]) : value;

const storedChangesOf = (value: StoredChange[] | string | null | undefined): StoredChange[] =>
  value === null || value === undefined ? [] : typeof value === "string" ? (JSON.parse(value) as StoredChange[]) : value;

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
  const draft: DraftDto | null =
    row.draft_id && row.draft_status
      ? {
          id: row.draft_id,
          status: row.draft_status,
          events: proposalsOf(row.proposed_events).map(proposedDto),
          changes: storedChangesOf(row.changes).map(changeDto),
        }
      : null;
  return { id: row.id, role: row.role, text: row.text, createdAt: new Date(row.created_at).toISOString(), draft };
}

/** The latest `limit` messages with their drafts, oldest first. */
export async function readMessages(query: Query, limit: number): Promise<ChatMessageDto[]> {
  const rows = await query<MessageRow>(`${MESSAGE_SELECT} order by m.seq desc limit $1`, [limit]);
  return rows.reverse().map(toMessageDto);
}

/** The same as what Claude receives as history (R22). */
export function historyOf(messages: readonly ChatMessageDto[]): HistoryInput[] {
  return messages.map((m) => ({
    role: m.role,
    text: m.text,
    draft: m.draft
      ? {
          status: m.draft.status,
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
        }
      : null,
  }));
}

/**
 * The user's plan and how many messages they sent today (R21), on the database's clock in the user's
 * time zone: the same day the counting function uses.
 */
export async function readChatAccount(query: Query): Promise<{ plan: Plan; usedToday: number }> {
  const [row] = await query<{ plan: Plan; used: number }>(
    `select p.plan,
            case when p.chat_count_date = (now() at time zone s.time_zone)::date then p.chat_count else 0 end as used
       from app.profiles p cross join app.settings s`,
  );
  return { plan: row?.plan ?? "free", usedToday: row?.used ?? 0 };
}

/** Counts one message for today; false when today's 20 are used (the database decides, atomically). */
export async function countMessage(query: Query): Promise<boolean> {
  const [row] = await query<{ counted: boolean }>("select app.chat_count_message() as counted");
  return row?.counted === true;
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
};

/** The user's events in the window. No location is read. */
export async function readCalendar(query: Query, now: Date, timeZone: string): Promise<CalendarEntry[]> {
  const w = calendarWindow(now, timeZone);
  const rows = await query<CalendarRow>(
    `select id, title, all_day, start_at, end_at, first_day::text as first_day, last_day::text as last_day, may_overlap,
            goal_id, series_id, source, updated_at
       from app.events
      where (not all_day and end_at > $1 and start_at < $2)
         or (all_day and last_day >= $3::date and first_day <= $4::date)
      order by coalesce(start_at, first_day::timestamptz), id`,
    [w.from, w.until, w.today, w.lastDay],
  );
  return rows.map((r) => {
    const own = {
      id: r.id,
      updatedAt: new Date(r.updated_at).toISOString(),
      goalId: r.goal_id,
      source: r.source,
      seriesId: r.series_id,
    };
    return r.all_day
      ? { ...own, allDay: true as const, title: r.title, firstDay: r.first_day!, lastDay: r.last_day!, mayOverlap: r.may_overlap }
      : { ...own, allDay: false as const, title: r.title, startAt: new Date(r.start_at!), endAt: new Date(r.end_at!), mayOverlap: r.may_overlap };
  });
}

/**
 * Spec 20, decision 2: gives every event a reference valid for this one request ("e1", "e2", … in
 * calendar order) and whether the coach may change it (decision 3).
 */
export function withReferences(calendar: readonly CalendarEntry[], now: Date): CalendarEntry[] {
  return calendar.map((e, i) => ({
    ...e,
    ref: `e${i + 1}`,
    changeable: isChangeable({ allDay: e.allDay, source: e.source, seriesId: e.seriesId, startAt: e.allDay ? null : e.startAt }, now),
  }));
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
    const changeable = isChangeable({ allDay: false, source: event.source, seriesId: event.seriesId, startAt: event.startAt }, now);
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

/** The goals with deadlines and rules (R22). */
export async function readGoalInputs(query: Query): Promise<GoalInput[]> {
  const goals = await readGoals(query);
  return goals.map(({ goal }) => ({
    id: goal.id,
    title: goal.title,
    deadline: goal.deadline,
    rules: goal.rules.map((r) => ({ kind: r.kind, target: r.target, minMinutes: r.minMinutes })),
  }));
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
  userText: string,
  answer: { text: string; proposals: readonly Proposal[] | null; changes?: readonly Change[] },
): Promise<ChatMessageDto[]> {
  await query("select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('chat:' || auth.uid()::text))");
  if (answer.proposals) await query("update app.draft_plans set status = 'replaced' where status = 'open'");
  const [user] = await query<{ id: string }>("insert into app.chat_messages (role, text) values ('user', $1) returning id", [userText]);
  const [assistant] = await query<{ id: string }>(
    "insert into app.chat_messages (role, text) values ('assistant', $1) returning id",
    [answer.text],
  );
  if (answer.proposals) {
    // $2::text::jsonb, not $2::jsonb: the real database driver encodes a parameter it knows to be jsonb
    // as JSON itself, so an already encoded string would be saved as one JSON string, not as a list.
    // As text it arrives unchanged and the database turns it into jsonb.
    // The same for the changes (spec 20).
    await query("insert into app.draft_plans (message_id, proposed_events, changes) values ($1, $2::text::jsonb, $3::text::jsonb)", [
      assistant.id,
      JSON.stringify(toStored(answer.proposals)),
      JSON.stringify(toStoredChanges(answer.changes ?? [])),
    ]);
  }
  const rows = await query<MessageRow>(`${MESSAGE_SELECT} where m.id = any($1::uuid[]) order by m.seq`, [[user.id, assistant.id]]);
  return rows.map(toMessageDto);
}

export type DraftRow = {
  id: string;
  status: DraftStatus;
  proposed_events: StoredProposal[] | string;
  changes: StoredChange[] | string;
};

/** The user's draft, locked until the transaction ends (a second device waits). "Not found" otherwise (R3). */
export async function findOwnDraft(query: Query, id: string): Promise<DraftRow> {
  if (!UUID.test(id)) throw notFound();
  const [row] = await query<DraftRow>("select id, status, proposed_events, changes from app.draft_plans where id = $1 for update", [id]);
  if (!row) throw notFound();
  return row;
}

export function assertDraftOpen(draft: DraftRow): void {
  if (draft.status !== "open") throw new ActionError(409, "draft_not_open", MESSAGES.draftNotOpen);
}
