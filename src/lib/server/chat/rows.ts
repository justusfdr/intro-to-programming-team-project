import "server-only";

// Reading and writing the coach's rows (spec 19), always inside withUser, so row-level security limits
// every statement to the signed-in user (R3).
import type { CalendarBlock, Proposal } from "@/lib/chat/checks";
import type { CalendarInput, GoalInput, HistoryInput } from "@/lib/chat/input";
import { totalsWindow, type DoneEventInput, type SessionInput } from "@/lib/chat/totals";
import type { ChatMessageDto, ChatRole, DraftDto, DraftStatus, ProposedEventDto } from "@/lib/chat/types";
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

/** A proposed event as the database keeps it in draft_plans.proposed_events. */
type StoredProposal = { title: string; start_at: string; end_at: string; goal_id: string | null };

type MessageRow = {
  id: string;
  role: ChatRole;
  text: string;
  created_at: Date;
  draft_id: string | null;
  draft_status: DraftStatus | null;
  proposed_events: StoredProposal[] | string | null;
};

const MESSAGE_SELECT = `select m.id, m.role, m.text, m.created_at, d.id as draft_id, d.status as draft_status, d.proposed_events
  from app.chat_messages m left join app.draft_plans d on d.message_id = m.id`;

// The driver may hand JSON over as text.
const storedOf = (value: StoredProposal[] | string | null): StoredProposal[] =>
  value === null ? [] : typeof value === "string" ? (JSON.parse(value) as StoredProposal[]) : value;

export function toStored(proposals: readonly Proposal[]): StoredProposal[] {
  return proposals.map((p) => ({
    title: p.title,
    start_at: p.startAt.toISOString(),
    end_at: p.endAt.toISOString(),
    goal_id: p.goalId,
  }));
}

export function proposalsOf(value: StoredProposal[] | string | null): Proposal[] {
  return storedOf(value).map((p) => ({
    title: p.title,
    startAt: new Date(p.start_at),
    endAt: new Date(p.end_at),
    goalId: p.goal_id ?? null,
  }));
}

const proposedDto = (p: Proposal): ProposedEventDto => ({
  title: p.title,
  startAt: p.startAt.toISOString(),
  endAt: p.endAt.toISOString(),
  goalId: p.goalId,
});

function toMessageDto(row: MessageRow): ChatMessageDto {
  const draft: DraftDto | null =
    row.draft_id && row.draft_status
      ? { id: row.draft_id, status: row.draft_status, events: proposalsOf(row.proposed_events).map(proposedDto) }
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
          events: m.draft.events.map((e) => ({ title: e.title, startAt: new Date(e.startAt), endAt: new Date(e.endAt), goalId: e.goalId })),
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
  title: string;
  all_day: boolean;
  start_at: Date | null;
  end_at: Date | null;
  first_day: string | null;
  last_day: string | null;
  may_overlap: boolean;
};

/** The user's events in the window. Only the fields R22 allows are read: no location, no ids. */
export async function readCalendar(query: Query, now: Date, timeZone: string): Promise<CalendarInput[]> {
  const w = calendarWindow(now, timeZone);
  const rows = await query<CalendarRow>(
    `select title, all_day, start_at, end_at, first_day::text as first_day, last_day::text as last_day, may_overlap
       from app.events
      where (not all_day and end_at > $1 and start_at < $2)
         or (all_day and last_day >= $3::date and first_day <= $4::date)
      order by coalesce(start_at, first_day::timestamptz)`,
    [w.from, w.until, w.today, w.lastDay],
  );
  return rows.map((r) =>
    r.all_day
      ? { allDay: true as const, title: r.title, firstDay: r.first_day!, lastDay: r.last_day!, mayOverlap: r.may_overlap }
      : { allDay: false as const, title: r.title, startAt: new Date(r.start_at!), endAt: new Date(r.end_at!), mayOverlap: r.may_overlap },
  );
}

/** The timed events among them, as the overlap check of R23 takes them. */
export function blocksOf(calendar: readonly CalendarInput[]): CalendarBlock[] {
  return calendar.flatMap((e) => (e.allDay ? [] : [{ startAt: e.startAt, endAt: e.endAt, mayOverlap: e.mayOverlap }]));
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
  answer: { text: string; proposals: readonly Proposal[] | null },
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
    await query("insert into app.draft_plans (message_id, proposed_events) values ($1, $2::text::jsonb)", [
      assistant.id,
      JSON.stringify(toStored(answer.proposals)),
    ]);
  }
  const rows = await query<MessageRow>(`${MESSAGE_SELECT} where m.id = any($1::uuid[]) order by m.seq`, [[user.id, assistant.id]]);
  return rows.map(toMessageDto);
}

export type DraftRow = { id: string; status: DraftStatus; proposed_events: StoredProposal[] | string };

/** The user's draft, locked until the transaction ends (a second device waits). "Not found" otherwise (R3). */
export async function findOwnDraft(query: Query, id: string): Promise<DraftRow> {
  if (!UUID.test(id)) throw notFound();
  const [row] = await query<DraftRow>("select id, status, proposed_events from app.draft_plans where id = $1 for update", [id]);
  if (!row) throw notFound();
  return row;
}

export function assertDraftOpen(draft: DraftRow): void {
  if (draft.status !== "open") throw new ActionError(409, "draft_not_open", MESSAGES.draftNotOpen);
}
