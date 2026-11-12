import "server-only";

// Actions mark_event_done and mark_event_planned (ontology section 5; spec 02, task E3). Same pattern as
// create_event, without a body:
//   1. same-origin check   2. signed in (R3)   3. inside withUser: find the user's event ("Not found"
//   otherwise, R3), check the rule, write   4. one answer per outcome.
// Only edit and delete check updated_at (R4); marking done or planned does not.
import type { EventStatus } from "@/lib/events/types";
import { MESSAGES } from "@/lib/messages";
import type { Query } from "@/lib/server/db";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { findOwnEvent } from "@/lib/server/events/own-event";
import { EVENT_COLUMNS, toEventDto, type EventRow } from "@/lib/server/events/rows";
import { assertSameOrigin, jsonOk } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

type StatusDeps = Pick<Deps, "auth" | "withUser" | "now">;

/** Sets the status, but only writes when it changes, so updated_at stays the same for a repeat. */
async function setStatus(query: Query, row: EventRow, status: EventStatus): Promise<Response> {
  if (row.status === status) return jsonOk({ event: toEventDto(row) });
  const [updated] = await query<EventRow>(
    `update app.events set status = $2 where id = $1 returning ${EVENT_COLUMNS}`,
    [row.id, status],
  );
  return jsonOk({ event: toEventDto(updated) });
}

export function markEventDone(request: Request, deps: StatusDeps, id: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    return deps.withUser(userId, async (query) => {
      const row = await findOwnEvent(query, id);
      // R29: an all-day event stays planned.
      if (row.all_day || !row.start_at) throw new ActionError(409, "all_day", MESSAGES.allDayNotDone);
      // An event may be marked done once it has started; the start moment itself counts as started.
      if (deps.now().getTime() < new Date(row.start_at).getTime()) {
        throw new ActionError(409, "not_started", MESSAGES.notStarted);
      }
      return setStatus(query, row, "done");
    });
  });
}

export function markEventPlanned(request: Request, deps: StatusDeps, id: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    return deps.withUser(userId, async (query) => {
      const row = await findOwnEvent(query, id);
      return setStatus(query, row, "planned");
    });
  });
}
