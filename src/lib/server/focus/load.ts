import "server-only";

// Data for the Focus page: the active session, recent finished sessions with their focused minutes,
// and the event the page was opened for. Due sessions finish first (R13).
import { focusedMinutes, lengthForEvent } from "@/lib/focus/session-time";
import type { FocusData } from "@/lib/focus/types";
import type { Deps } from "@/lib/server/deps";
import { settleSessions, SESSION_COLUMNS, SESSION_FROM, timesOf, toSessionDto, type SessionRow } from "./sessions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECENT = 10;

export async function loadFocus(deps: Pick<Deps, "withUser" | "now">, userId: string, eventId?: string): Promise<FocusData> {
  const now = deps.now();
  // The same order as every session action: finish due sessions (saved on their own), then read.
  await settleSessions(deps, userId, now);
  return deps.withUser(userId, async (query) => {

    const [active] = await query<SessionRow>(`select ${SESSION_COLUMNS} from ${SESSION_FROM} where s.status in ('running', 'paused')`);
    const recent = await query<SessionRow>(
      `select ${SESSION_COLUMNS} from ${SESSION_FROM} where s.status = 'finished' order by s.ended_at desc, s.id limit ${RECENT}`,
    );

    // Opened from an event: only the user's own event counts; anything else is ignored.
    let forEvent: FocusData["forEvent"] = null;
    if (eventId && UUID.test(eventId)) {
      const [event] = await query<{ id: string; title: string; minutes: number }>(
        "select id, title, extract(epoch from end_at - start_at)::int / 60 as minutes from app.events where id = $1",
        [eventId],
      );
      if (event) forEvent = { id: event.id, title: event.title, suggestedMinutes: lengthForEvent(event.minutes) };
    }

    return {
      active: active ? toSessionDto(active) : null,
      recent: recent.map((row) => ({ ...toSessionDto(row), focusedMinutes: focusedMinutes(timesOf(row), now) })),
      forEvent,
      now: now.toISOString(),
    };
  });
}
