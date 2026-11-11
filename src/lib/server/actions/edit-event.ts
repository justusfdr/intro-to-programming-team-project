import "server-only";

// Action edit_event (ontology section 5; spec 02, task E1). Same pattern as create_event:
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the body
//   4. inside withUser: find the user's event ("Not found" otherwise, R3), check it has not changed
//      since the device last saw it (R4), check the rules, write   5. one answer per outcome.
// Status, source and user_id are never changed here.
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { handleAction } from "@/lib/server/errors";
import { checkEventFields, EventFields } from "@/lib/server/events/input";
import { assertUnchangedSince, findOwnEvent } from "@/lib/server/events/own-event";
import { EVENT_COLUMNS, toEventDto, type EventRow } from "@/lib/server/events/rows";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { readTimeZone } from "@/lib/server/settings";

/** The edit form's fields, plus the updated_at the device last saw (R4). */
const EditBody = EventFields.extend({ updatedAt: z.string().max(40) });

export function editEvent(request: Request, deps: Pick<Deps, "auth" | "withUser">, id: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, EditBody);
    if (!body.ok) return body.response;

    return deps.withUser(userId, async (query) => {
      // Locks the row until the transaction ends, so a second device waits instead of racing.
      const row = await findOwnEvent(query, id);
      assertUnchangedSince(row, body.data.updatedAt);

      const event = checkEventFields(body.data, await readTimeZone(query));

      // updated_at is set again by the database trigger; the user never sets it.
      const [updated] = await query<EventRow>(
        `update app.events set title = $2, start_at = $3, end_at = $4, may_overlap = $5
         where id = $1
         returning ${EVENT_COLUMNS}`,
        [id, event.title, event.startAt, event.endAt, event.mayOverlap],
      );
      return jsonOk({ message: MESSAGES.eventSaved, event: toEventDto(updated) });
    });
  });
}
