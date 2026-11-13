import "server-only";

// Action edit_draft (spec 22; ontology section 5, R1, R3, R4, R23): the person dragged one block of the
// open draft (a new event, or an event the coach moves) to new times on the same day.
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the body
//   4. one transaction: the user's draft, locked ("Not found" otherwise, R3; a second device waits);
//      still open ("This draft is no longer open"); the version the screen last saw (R4, "Changed on
//      another device"); the draft as it is must still pass R23 against the calendar as it is now
//      ("This draft is out of date. Ask again"); then the draft as it would be with the block at its
//      new times runs through every check of R23 (src/lib/chat/checks.ts, the same module as for the
//      assistant's answer and for accepting). One failed check refuses the change and nothing is
//      saved (R1). Then app.chat_edit_draft writes the two times and moves the version on; it checks
//      again what the database can.
// Spec 23: a draft's to-dos for existing events are not blocks and cannot be dragged; the draft's other
// blocks can, and the checks run on the whole draft with them.
// The calendar does not change: only "Add to calendar" / "Apply changes" (accept_draft) does that, with
// the draft as the person left it.
import { z } from "zod";
import { checkDraft } from "@/lib/chat/checks";
import { editRefusal, withEditedBlock, type DraftItem } from "@/lib/chat/edit";
import { MESSAGES } from "@/lib/messages";
import {
  assertDraftOpen,
  blocksOf,
  currentAdditions,
  currentChanges,
  findOwnDraft,
  proposalsOf,
  readCalendar,
  readDraft,
} from "@/lib/server/chat/rows";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { notFound } from "@/lib/server/events/own-event";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { readTimeZone } from "@/lib/server/settings";
import { localDateTimeOf, parseLocalDateTime } from "@/lib/time/zoned";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** The block, its new local start and end ("2026-11-17T09:00"), and the draft's version the screen saw. */
const EditBody = z
  .object({
    version: z.number().int().min(0).max(1_000_000),
    item: z.union([
      z.object({ kind: z.literal("new"), index: z.number().int().min(0).max(100) }).strict(),
      z.object({ kind: z.literal("move"), eventId: z.string().max(40) }).strict(),
    ]),
    start: z.string().max(20),
    end: z.string().max(20),
  })
  .strict();

const badTime = () => new ActionError(400, "bad_request", MESSAGES.badRequest);

/** A local date-time that really exists in the zone, as an instant (a skipped hour is refused). */
function exactLocal(value: string, timeZone: string): Date {
  if (!LOCAL.test(value)) throw badTime();
  const instant = parseLocalDateTime(value, timeZone);
  if (!instant || localDateTimeOf(instant, timeZone) !== value) throw badTime();
  return instant;
}

export function editDraft(request: Request, deps: Pick<Deps, "auth" | "withUser" | "now">, id: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, EditBody);
    if (!body.ok) return body.response;
    const item: DraftItem = body.data.item;
    // A malformed event id is "Not found", like a missing one (R3).
    if (item.kind === "move" && !UUID.test(item.eventId)) throw notFound();

    try {
      return await deps.withUser(userId, async (query) => {
        const draft = await findOwnDraft(query, id);
        assertDraftOpen(draft);
        if (draft.version !== body.data.version) throw new ActionError(409, "changed_elsewhere", MESSAGES.changedElsewhere);

        const now = deps.now();
        const timeZone = await readTimeZone(query);
        const startAt = exactLocal(body.data.start, timeZone);
        const endAt = exactLocal(body.data.end, timeZone);
        const [calendar, goals] = await Promise.all([readCalendar(query, now, timeZone), query<{ id: string }>("select id from app.goals")]);
        const context = { now, timeZone, goalIds: new Set(goals.map((g) => g.id)), calendar: blocksOf(calendar) };
        const outOfDate = () => new ActionError(409, "draft_out_of_date", MESSAGES.draftOutOfDate);

        // The draft as it is: still what accepting would check (otherwise it cannot be applied anyway).
        const proposals = proposalsOf(draft.proposed_events);
        const changes = currentChanges(draft.changes, calendar, now);
        if (changes === null) throw outOfDate();
        // Spec 23: to-dos for existing events cannot be dragged, but they count for the draft's checks.
        const additions = currentAdditions(draft.added_todos, calendar, now, timeZone);
        if (additions === null) throw outOfDate();
        if (!checkDraft(proposals, changes, context, additions).ok) throw outOfDate();

        // The draft as it would be with the block at its new times, through every check of R23.
        const edited = withEditedBlock(proposals, changes, item, startAt, endAt, timeZone);
        if (!edited.ok) {
          const refusal = editRefusal(edited.failure, item);
          throw new ActionError(refusal.status, refusal.code, refusal.message);
        }
        const checked = checkDraft(edited.proposals, edited.changes, context, additions);
        if (!checked.ok) {
          const refusal = editRefusal(checked.failure, item);
          throw new ActionError(refusal.status, refusal.code, refusal.message);
        }

        await query("select app.chat_edit_draft($1::uuid, $2::integer, $3::integer, $4::uuid, $5::timestamptz, $6::timestamptz)", [
          draft.id,
          draft.version,
          item.kind === "new" ? item.index : null,
          item.kind === "move" ? item.eventId : null,
          startAt.toISOString(),
          endAt.toISOString(),
        ]);
        const saved = await readDraft(query, draft.id);
        return jsonOk({ message: MESSAGES.draftEdited, draft: saved });
      });
    } catch (error) {
      // The database's own refusals (they repeat checks made above, so they come only from a race).
      const constraint = (error as { constraint?: unknown } | null)?.constraint;
      if (constraint === "draft_plans_status_forward") throw new ActionError(409, "draft_not_open", MESSAGES.draftNotOpen);
      if (constraint === "draft_plans_stale") throw new ActionError(409, "changed_elsewhere", MESSAGES.changedElsewhere);
      throw error;
    }
  });
}
