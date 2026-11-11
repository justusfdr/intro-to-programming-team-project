import "server-only";

// Action start_session (ontology section 5; spec 04). Same pattern as create_event:
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the body
//   4. inside withUser: let due sessions finish (R13), refuse a second active session (R4),
//      check the length (R12) and the event, write   5. one answer per outcome.
// The start time comes from the server's clock, never from the browser.
import { z } from "zod";
import { isSessionLength } from "@/lib/focus/session-time";
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { findOwnEvent } from "@/lib/server/events/own-event";
import { activeSession, finishDueSessions, SESSION_COLUMNS, SESSION_FROM, toSessionDto, type SessionRow } from "@/lib/server/focus/sessions";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

const StartBody = z.object({
  minutes: z.number(),
  /** The event to focus on, or none. */
  eventId: z.string().max(40).nullable().optional(),
});

/** The database's answer when a second device starts a session at the same moment (R4). */
function isSecondActiveSession(error: unknown): boolean {
  return error instanceof Error && error.message.includes("focus_sessions_one_active");
}

export function startSession(request: Request, deps: Pick<Deps, "auth" | "withUser" | "now">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, StartBody);
    if (!body.ok) return body.response;

    const now = deps.now();
    try {
      return await deps.withUser(userId, async (query) => {
        await finishDueSessions(query, now);
        if (await activeSession(query)) throw new ActionError(409, "session_running", MESSAGES.sessionRunning);
        if (!isSessionLength(body.data.minutes)) throw new ActionError(400, "choose_length", MESSAGES.chooseLength);

        // The event must be the user's own, else "Not found" (R3); the database checks it too.
        const eventId = body.data.eventId ?? null;
        if (eventId !== null) await findOwnEvent(query, eventId);

        const [{ id }] = await query<{ id: string }>(
          "insert into app.focus_sessions (event_id, planned_minutes, started_at) values ($1, $2, $3) returning id",
          [eventId, body.data.minutes, now],
        );
        const [row] = await query<SessionRow>(`select ${SESSION_COLUMNS} from ${SESSION_FROM} where s.id = $1`, [id]);
        return jsonOk({ message: MESSAGES.sessionStarted, session: toSessionDto(row) }, 201);
      });
    } catch (error) {
      // Two devices at the same moment: the database lets only one through (R4).
      if (isSecondActiveSession(error)) throw new ActionError(409, "session_running", MESSAGES.sessionRunning);
      throw error;
    }
  });
}
