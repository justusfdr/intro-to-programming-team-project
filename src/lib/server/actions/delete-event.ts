import "server-only";

// Action delete_event (ontology section 5; spec 02, task E2). Same pattern as edit_event:
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the body
//   4. inside withUser: find the user's event ("Not found" otherwise, R3), check it has not changed
//      since the device last saw it (R4), delete it   5. one answer per outcome.
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { handleAction } from "@/lib/server/errors";
import { assertUnchangedSince, findOwnEvent } from "@/lib/server/events/own-event";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

/** The updated_at the device last saw (R4). */
const DeleteBody = z.object({ updatedAt: z.string().max(40) });

export function deleteEvent(request: Request, deps: Pick<Deps, "auth" | "withUser">, id: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, DeleteBody);
    if (!body.ok) return body.response;

    return deps.withUser(userId, async (query) => {
      // Locks the row until the transaction ends, so a second device waits instead of racing.
      const row = await findOwnEvent(query, id);
      assertUnchangedSince(row, body.data.updatedAt);

      await query(`delete from app.events where id = $1`, [id]);
      return jsonOk({ message: MESSAGES.eventDeleted });
    });
  });
}
