import "server-only";

// Spec 37 (R67): before the draft is applied, the person takes someone off a proposed event in the card
// (never adds someone). POST /api/chat/drafts/[id]/people with { version, index, person }.
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the body
//   4. one transaction: app.chat_draft_remove_person, which works only on the user's own open draft,
//      only with the version the screen last saw (R4), only for a person that proposed event lists,
//      and changes nothing else of the draft; then the draft as it is now.
// The calendar does not change. "Not found" for a foreign, missing or malformed draft and for a person
// the event does not list, the same in each case.
import { z } from "zod";
import { isDemoId } from "@/lib/demo/people";
import { MESSAGES } from "@/lib/messages";
import { readDraft } from "@/lib/server/chat/rows";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { notFound } from "@/lib/server/events/own-event";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Body = z
  .object({
    version: z.number().int().min(0).max(1_000_000),
    index: z.number().int().min(0).max(100),
    person: z.string().max(40),
  })
  .strict();

export const PERSON_REMOVED = "Taken off this event.";

export function removeDraftPerson(request: Request, deps: Pick<Deps, "auth" | "withUser">, id: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, Body);
    if (!body.ok) return body.response;
    // A malformed draft id or person is "Not found", like a missing one (R3).
    if (!UUID.test(id) || !(UUID.test(body.data.person) || isDemoId(body.data.person))) throw notFound();

    try {
      return await deps.withUser(userId, async (query) => {
        await query("select app.chat_draft_remove_person($1::uuid, $2::integer, $3::integer, $4::text)", [
          id,
          body.data.version,
          body.data.index,
          body.data.person,
        ]);
        return jsonOk({ message: PERSON_REMOVED, draft: await readDraft(query, id) });
      });
    } catch (error) {
      const constraint = (error as { constraint?: unknown } | null)?.constraint;
      if (constraint === "draft_plans_status_forward") throw new ActionError(409, "draft_not_open", MESSAGES.draftNotOpen);
      if (constraint === "draft_plans_stale") throw new ActionError(409, "changed_elsewhere", MESSAGES.changedElsewhere);
      if (error instanceof Error && error.message === MESSAGES.notFound) throw notFound();
      throw error;
    }
  });
}
