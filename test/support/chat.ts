// Helpers for the coach's tests (spec 19): set a user's plan and today's message count, put a message
// with a draft straight into the database, and read the chat back. All as the database owner.
import type { TestDb } from "../db/harness";

export async function setPlan(db: TestDb, userId: string, plan: "free" | "pro"): Promise<void> {
  await db.admin("update app.profiles set plan = $2 where id = $1", [userId, plan]);
}

/** Sets how many messages the user sent today (today on the database's clock, in the user's time zone). */
export async function setSentToday(db: TestDb, userId: string, count: number): Promise<void> {
  await db.admin(
    `update app.profiles p set chat_count = $2, chat_count_date = (now() at time zone s.time_zone)::date
       from app.settings s where s.user_id = p.id and p.id = $1`,
    [userId, count],
  );
}

/** How many messages the user sent today (0 when the stored day is another one). */
export async function sentToday(db: TestDb, userId: string): Promise<number> {
  const [row] = await db.admin<{ n: number }>(
    `select case when p.chat_count_date = (now() at time zone s.time_zone)::date then p.chat_count else 0 end as n
       from app.profiles p join app.settings s on s.user_id = p.id where p.id = $1`,
    [userId],
  );
  return row.n;
}

export type SeedProposal = { title: string; start: string; end: string; goalId?: string | null };

/** A change of an existing event in a draft (spec 20): the event as seedEvent returned it, and the new times of a move. */
export type SeedChange =
  | { kind: "move"; event: { id: string; updatedAt: string }; title?: string; oldStart: string; oldEnd: string; start: string; end: string }
  | { kind: "delete"; event: { id: string; updatedAt: string }; title?: string; oldStart: string; oldEnd: string };

/**
 * An assistant message carrying a draft (status open unless given), with a user message before it.
 * `changes` (spec 20) are saved as send_message saves them.
 */
export async function seedDraft(
  db: TestDb,
  userId: string,
  proposals: SeedProposal[],
  status: "open" | "accepted" | "rejected" | "replaced" = "open",
  changes: SeedChange[] = [],
): Promise<{ messageId: string; draftId: string }> {
  await db.admin("insert into app.chat_messages (user_id, role, text) values ($1, 'user', 'Plan tomorrow')", [userId]);
  const [m] = await db.admin<{ id: string }>(
    "insert into app.chat_messages (user_id, role, text) values ($1, 'assistant', 'Here is your day.') returning id",
    [userId],
  );
  const stored = proposals.map((p) => ({ title: p.title, start_at: p.start, end_at: p.end, goal_id: p.goalId ?? null }));
  const storedChanges = changes.map((c) => ({
    kind: c.kind,
    event_id: c.event.id,
    updated_at: c.event.updatedAt,
    title: c.title ?? "Statistics revision",
    goal_id: null,
    old_start_at: c.oldStart,
    old_end_at: c.oldEnd,
    start_at: c.kind === "move" ? c.start : null,
    end_at: c.kind === "move" ? c.end : null,
  }));
  const [d] = await db.admin<{ id: string }>(
    "insert into app.draft_plans (user_id, message_id, proposed_events, changes) values ($1, $2, $3::jsonb, $4::jsonb) returning id",
    [userId, m.id, JSON.stringify(stored), JSON.stringify(storedChanges)],
  );
  if (status !== "open") await db.admin("update app.draft_plans set status = $2 where id = $1", [d.id, status]);
  return { messageId: m.id, draftId: d.id };
}

/** The user's messages, oldest first, each with its draft's status and proposals (or null). */
export async function chatOf(db: TestDb, userId: string) {
  return db.admin<{ role: string; text: string; status: string | null; proposed_events: unknown }>(
    `select m.role, m.text, d.status, d.proposed_events
       from app.chat_messages m left join app.draft_plans d on d.message_id = m.id
      where m.user_id = $1 order by m.seq`,
    [userId],
  );
}

/** The user's drafts, oldest first. */
export async function draftsOf(db: TestDb, userId: string) {
  return db.admin<{ id: string; status: string }>("select id, status from app.draft_plans where user_id = $1 order by created_at, id", [
    userId,
  ]);
}

// A5: Tuesday 17 November 2026 (Lisbon is UTC+0 in November).
export const A5_ANSWER = {
  kind: "draft",
  text: "Here is your Tuesday.",
  events: [
    { title: "Study", start: "2026-11-17T08:00", end: "2026-11-17T13:00", goalId: null },
    { title: "Call", start: "2026-11-17T13:30", end: "2026-11-17T14:00", goalId: null },
    { title: "Sport", start: "2026-11-17T18:00", end: "2026-11-17T19:30", goalId: null },
    { title: "Event", start: "2026-11-17T20:00", end: "2026-11-17T22:30", goalId: null },
  ],
};

export const A5_PROPOSALS: SeedProposal[] = [
  { title: "Study", start: "2026-11-17T08:00:00.000Z", end: "2026-11-17T13:00:00.000Z" },
  { title: "Call", start: "2026-11-17T13:30:00.000Z", end: "2026-11-17T14:00:00.000Z" },
  { title: "Sport", start: "2026-11-17T18:00:00.000Z", end: "2026-11-17T19:30:00.000Z" },
  { title: "Event", start: "2026-11-17T20:00:00.000Z", end: "2026-11-17T22:30:00.000Z" },
];
