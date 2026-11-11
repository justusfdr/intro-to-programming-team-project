import "server-only";

// Action create_event (ontology section 5; spec 02). Reference pattern for actions of a signed-in user:
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the body
//   4. inside withUser: read what the rules need, check the rules, write   5. one answer per outcome.
// Every database call goes through withUser, so row-level security applies; a thrown rejection
// rolls the transaction back, so nothing is saved (R1).
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { handleAction } from "@/lib/server/errors";
import { checkEventFields, EventFields } from "@/lib/server/events/input";
import { EVENT_COLUMNS, toEventDto, type EventRow } from "@/lib/server/events/rows";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { readTimeZone } from "@/lib/server/settings";

export function createEvent(request: Request, deps: Pick<Deps, "auth" | "withUser">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, EventFields);
    if (!body.ok) return body.response;

    return deps.withUser(userId, async (query) => {
      // The form sends local times; the user's time zone turns them into instants (stored in UTC).
      const event = checkEventFields(body.data, await readTimeZone(query));

      // user_id, status ("planned"), source ("app") and updated_at are filled in by the database.
      const [row] = await query<EventRow>(
        `insert into app.events (title, start_at, end_at, may_overlap)
         values ($1, $2, $3, $4)
         returning ${EVENT_COLUMNS}`,
        [event.title, event.startAt, event.endAt, event.mayOverlap],
      );
      return jsonOk({ message: MESSAGES.eventSaved, event: toEventDto(row) }, 201);
    });
  });
}
