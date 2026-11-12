import "server-only";

// Actions pause_session and resume_session (ontology section 5; spec 04, task F1). Same pattern as
// start_session, without a body:
//   1. same-origin check   2. signed in (R3)   3. inside withUser: let due sessions finish (R13),
//   find the user's session ("Not found" otherwise, R3), check its state, write   4. one answer per outcome.
// Times come from the server's clock (deps.now), never from the request.
import { pausedSecondsAfterResume } from "@/lib/focus/session-time";
import { MESSAGES } from "@/lib/messages";
import type { Query } from "@/lib/server/db";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import {
  finishDueSessions,
  findOwnSession,
  SESSION_COLUMNS,
  SESSION_FROM,
  timesOf,
  toSessionDto,
  type SessionRow,
} from "@/lib/server/focus/sessions";
import { assertSameOrigin, jsonError, jsonOk } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

type SessionDeps = Pick<Deps, "auth" | "withUser" | "now">;

/** The session as the Focus page reads it, after a write. */
async function readSession(query: Query, id: string) {
  const [row] = await query<SessionRow>(`select ${SESSION_COLUMNS} from ${SESSION_FROM} where s.id = $1`, [id]);
  return toSessionDto(row);
}

export function pauseSession(request: Request, deps: SessionDeps, id: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);
    const now = deps.now();

    return deps.withUser(userId, async (query) => {
      await finishDueSessions(query, now);
      const row = await findOwnSession(query, id);
      // Answered, not thrown: a throw would roll back the finish that finishDueSessions just saved (R13).
      if (row.status === "finished") return jsonError(409, "session_ended", MESSAGES.sessionEnded);
      // Only a running session can be paused (R13: a paused session stays paused).
      if (row.status !== "running") throw new ActionError(409, "not_possible", MESSAGES.notPossible);

      await query("update app.focus_sessions set status = 'paused', paused_at = $2 where id = $1", [id, now]);
      return jsonOk({ message: MESSAGES.sessionPaused, session: await readSession(query, id) });
    });
  });
}

export function resumeSession(request: Request, deps: SessionDeps, id: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);
    const now = deps.now();

    return deps.withUser(userId, async (query) => {
      await finishDueSessions(query, now);
      const row = await findOwnSession(query, id);
      // Answered, not thrown: a throw would roll back the finish that finishDueSessions just saved (R13).
      if (row.status === "finished") return jsonError(409, "session_ended", MESSAGES.sessionEnded);
      if (row.status !== "paused") throw new ActionError(409, "not_possible", MESSAGES.notPossible);

      // The pause that just ended adds to the paused time (R13).
      const pausedSeconds = pausedSecondsAfterResume(timesOf(row), now);
      await query(
        "update app.focus_sessions set status = 'running', paused_at = null, paused_seconds = $2 where id = $1",
        [id, pausedSeconds],
      );
      return jsonOk({ message: MESSAGES.sessionResumed, session: await readSession(query, id) });
    });
  });
}
