import "server-only";

// Data for the Focus page: the active session, recent finished sessions with their focused minutes,
// the event the page was opened for, and the user's goals with their look (to show a session's goal).
// Due sessions finish first (R13).
import { focusedMinutes, lengthForEvent } from "@/lib/focus/session-time";
import type { FocusData } from "@/lib/focus/types";
import { lookOf } from "@/lib/goals/style";
import type { Query } from "@/lib/server/db";
import type { Deps } from "@/lib/server/deps";
import { readGoals } from "@/lib/server/goals/rows";
import { settleSessions, SESSION_COLUMNS, SESSION_FROM, timesOf, toSessionDto, type SessionRow } from "./sessions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECENT = 10;

export async function loadFocus(deps: Pick<Deps, "withUser" | "now">, userId: string, eventId?: string): Promise<FocusData> {
  const now = deps.now();
  // The same order as every session action: finish due sessions (saved on their own), then read.
  await settleSessions(deps, userId, now);
  return deps.withUser(userId, (query) => readFocus(query, now, eventId));
}

/**
 * The same reads inside a transaction that is already open; call settleSessions before it.
 * The reads are started together; the one with a parameter (the event) comes last: the driver first
 * asks the database for its parameter types, and statements started after it wait until it is done
 * (see db/with-user.ts). `paramReadsAfter`: a page that starts other reads after this one passes a
 * promise it resolves once those are started, so they are not held up behind the event's read.
 */
export async function readFocus(query: Query, now: Date, eventId?: string, paramReadsAfter?: Promise<void>): Promise<FocusData> {
  // Opened from an event: only the user's own event counts; anything else is ignored.
  const wantsEvent = eventId !== undefined && UUID.test(eventId);
  const readEvent = () =>
    query<{ id: string; title: string; minutes: number; goal_id: string | null }>(
      // Only a timed event suggests a session; an all-day event is ignored here.
      "select id, title, extract(epoch from end_at - start_at)::int / 60 as minutes, goal_id from app.events where id = $1 and not all_day",
      [eventId],
    );
  const [actives, recent, goalRows, events] = await Promise.all([
    query<SessionRow>(`select ${SESSION_COLUMNS} from ${SESSION_FROM} where s.status in ('running', 'paused')`),
    query<SessionRow>(
      `select ${SESSION_COLUMNS} from ${SESSION_FROM} where s.status = 'finished' order by s.ended_at desc, s.id limit ${RECENT}`,
    ),
    readGoals(query),
    wantsEvent ? (paramReadsAfter ? paramReadsAfter.then(readEvent) : readEvent()) : Promise.resolve([]),
  ]);
  const [active] = actives;

  let forEvent: FocusData["forEvent"] = null;
  let forEventGoalId: string | null = null;
  const [event] = events;
  if (event) {
    forEvent = { id: event.id, title: event.title, suggestedMinutes: lengthForEvent(event.minutes) };
    forEventGoalId = event.goal_id;
  }
  const goals = goalRows.map(({ goal }, index) => ({ id: goal.id, title: goal.title, look: lookOf(goal, index) }));

  return {
    active: active ? toSessionDto(active) : null,
    recent: recent.map((row) => ({ ...toSessionDto(row), focusedMinutes: focusedMinutes(timesOf(row), now) })),
    forEvent,
    forEventGoalId,
    goals,
    now: now.toISOString(),
  };
}
