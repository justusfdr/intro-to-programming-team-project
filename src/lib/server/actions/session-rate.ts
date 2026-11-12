import "server-only";

// Action rate_session (ontology section 5; spec 04, task F3). Same pattern as start_session:
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the body
//   4. let due sessions finish, saved on their own (R13)
//   5. inside withUser: find the user's session ("Not found" otherwise, R3), check it has ended,
//      check the rating (a whole number from 0 to 5), write   6. one answer per outcome.
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { findOwnSession, settleSessions, SESSION_COLUMNS, SESSION_FROM, toSessionDto, type SessionRow } from "@/lib/server/focus/sessions";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

const RateBody = z.object({ rating: z.number() });

type SessionDeps = Pick<Deps, "auth" | "withUser" | "now">;

/** R14: the rating is a whole number from 0 to 5; 0 is a real rating. */
function isValidRating(rating: number): boolean {
  return Number.isInteger(rating) && rating >= 0 && rating <= 5;
}

export function rateSession(request: Request, deps: SessionDeps, id: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, RateBody);
    if (!body.ok) return body.response;

    await settleSessions(deps, userId, deps.now());
    return deps.withUser(userId, async (query) => {
      const row = await findOwnSession(query, id);
      if (row.status !== "finished") throw new ActionError(409, "not_possible", MESSAGES.notPossible);
      if (!isValidRating(body.data.rating)) throw new ActionError(400, "rating_range", MESSAGES.ratingRange);

      await query("update app.focus_sessions set rating = $2 where id = $1", [id, body.data.rating]);
      const [saved] = await query<SessionRow>(`select ${SESSION_COLUMNS} from ${SESSION_FROM} where s.id = $1`, [id]);
      return jsonOk({ message: MESSAGES.ratingSaved, session: toSessionDto(saved) });
    });
  });
}
