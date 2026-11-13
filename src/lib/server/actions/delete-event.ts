import "server-only";

// Action delete_event (ontology section 5; spec 02, task E2). Same pattern as edit_event:
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the body
//   4. inside withUser: find the user's event ("Not found" otherwise, R3), check it has not changed
//      since the device last saw it (R4), delete it   5. one answer per outcome.
// Scope (R28): "this" deletes the one event; "this_and_following" also the later events of its
// series, in the same transaction. The two-device check is on the event the user opened.
// Spec 21: the event's to-dos go with it (the database deletes them). Deleting one event answers with
// its to-dos (title and done, in order), so the calendar's Undo can bring them back with it (R38).
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { assertUnchangedSince, findOwnEvent } from "@/lib/server/events/own-event";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { readTodos } from "@/lib/server/todos/rows";

/** The updated_at the device last saw (R4). */
const DeleteBody = z.object({
  updatedAt: z.string().max(40),
  scope: z.enum(["this", "this_and_following"]).optional(),
});

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
      // R11: an Outlook event is deleted in Outlook; the next sync removes it here.
      if (row.source === "outlook") throw new ActionError(409, "outlook_event", MESSAGES.changeInOutlook);
      assertUnchangedSince(row, body.data.updatedAt);

      if (body.data.scope === "this_and_following" && row.series_id && row.start_at) {
        await query("delete from app.events where series_id = $1 and start_at >= $2", [row.series_id, row.start_at]);
        return jsonOk({ message: MESSAGES.seriesDeleted });
      }
      const todos = await readTodos(query, id);
      await query(`delete from app.events where id = $1`, [id]);
      // Only when it had to-dos, so the answer of an event without them stays as it was.
      return jsonOk(
        todos.length > 0
          ? { message: MESSAGES.eventDeleted, todos: todos.map((t) => ({ title: t.title, done: t.done })) }
          : { message: MESSAGES.eventDeleted },
      );
    });
  });
}
