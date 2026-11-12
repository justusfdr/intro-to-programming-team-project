import "server-only";

// Actions end_session and cancel_session (ontology section 5; spec 04, task F2). Same pattern as
// pause_session, without a body:
//   1. same-origin check   2. signed in (R3)   3. inside withUser: let due sessions finish (R13),
//   find the user's session ("Not found" otherwise, R3), check its state, write   4. one answer per outcome.
// Times come from the server's clock (deps.now), never from the request.
import { focusedSeconds, pausedSecondsAfterResume } from "@/lib/focus/session-time";
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { handleAction } from "@/lib/server/errors";
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

export function endSession(request: Request, deps: SessionDeps, id: string): Promise<Response> {
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

      // A pause still open at the end counts as paused time (R13).
      const pausedSeconds = pausedSecondsAfterResume(timesOf(row), now);
      const focused = focusedSeconds(
        { ...timesOf(row), status: "finished", pausedAt: null, pausedSeconds, endedAt: now },
        now,
      );

      // R14: under one focused minute, the session is deleted instead of saved.
      if (focused < 60) {
        await query("delete from app.focus_sessions where id = $1", [id]);
        return jsonOk({ message: MESSAGES.sessionTooShort, session: null });
      }

      await query(
        "update app.focus_sessions set status = 'finished', paused_at = null, paused_seconds = $2, ended_at = $3 where id = $1",
        [id, pausedSeconds, now],
      );
      const [saved] = await query<SessionRow>(`select ${SESSION_COLUMNS} from ${SESSION_FROM} where s.id = $1`, [id]);
      return jsonOk({ message: MESSAGES.sessionFinished, session: toSessionDto(saved) });
    });
  });
}

export function cancelSession(request: Request, deps: SessionDeps, id: string): Promise<Response> {
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

      await query("delete from app.focus_sessions where id = $1", [id]);
      return jsonOk({ message: MESSAGES.sessionCancelled });
    });
  });
}
