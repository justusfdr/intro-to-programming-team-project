import "server-only";

// Actions pause_session and resume_session (ontology section 5; spec 04, task F1). Same pattern as
// start_session, without a body:
//   1. same-origin check   2. signed in (R3)   3. let due sessions finish, saved on their own (R13)
//   4. inside withUser: find the user's session ("Not found" otherwise, R3), check its state, write
//   5. one answer per outcome.
// Times come from the server's clock (deps.now), never from the request.
import { pausedSecondsAfterResume } from "@/lib/focus/session-time";
import { MESSAGES } from "@/lib/messages";
import type { Query } from "@/lib/server/db";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import {
  findOwnSession,
  settleSessions,
  SESSION_COLUMNS,
  SESSION_FROM,
  timesOf,
  toSessionDto,
  type SessionRow,
} from "@/lib/server/focus/sessions";
import { assertSameOrigin, jsonOk } from "@/lib/server/http";
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

    await settleSessions(deps, userId, now);
    return deps.withUser(userId, async (query) => {
      const row = await findOwnSession(query, id);
      if (row.status === "finished") throw new ActionError(409, "session_ended", MESSAGES.sessionEnded);
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

    await settleSessions(deps, userId, now);
    return deps.withUser(userId, async (query) => {
      const row = await findOwnSession(query, id);
      if (row.status === "finished") throw new ActionError(409, "session_ended", MESSAGES.sessionEnded);
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
