import "server-only";

// Action accept_draft (ontology section 5, R1, R4, R21, R23; spec 19):
//   1. same-origin check   2. signed in (R3)
//   3. one transaction: the user's draft, locked ("Not found" otherwise, R3); still open; the chat is
//      allowed (R21, R5); R23's checks again against the calendar as it is now (a proposed event that
//      has started, a new event in the way, a deleted goal: "This draft is out of date. Ask again");
//      then app.chat_accept_draft creates all events with source "assistant" and marks the draft
//      accepted. Two devices accepting the same draft take turns on the lock: the second one is told
//      "This draft is no longer open", and the database itself accepts a draft only once (R4).
// Spec 20: a draft may also move and delete existing events. Each one must still be there with the
// updated_at the draft remembers and still be one the coach may change (R4, decision 3), and the checks
// run on the calendar as it would be after the whole draft; otherwise "This draft is out of date. Ask
// again". app.chat_apply_draft then applies everything in one step (the same statements as edit_event
// and delete_event, so Outlook gets the change as after a change by hand, R26) and remembers what
// undo_draft needs.
// Spec 23: a draft may also add to-dos to events already in the calendar. Each such event must still
// be in the calendar, be one the coach may add to-dos to and have room for them (it need not be
// unchanged); otherwise "This draft is out of date. Ask again". app.chat_apply_draft_todos then does
// everything app.chat_apply_draft does and also writes these to-dos at the end of each event's list,
// remembering their ids for undo.
// Spec 43 (R23, R45): a new event that names a goal must not start on a weekday the goal is never done
// on, checked against the goal's routine as it is now ("This draft is out of date. Ask again"). Every
// event the draft creates for a goal that has a place gets that place as its location: right after
// app.chat_apply_draft_todos, app.chat_place_created_events writes it through app.set_event_location
// and keeps undo possible. Both run in this one transaction, so if anything fails, nothing of the draft
// is applied and it stays open. Events the draft moves keep their location.
import { chatAllowed } from "@/lib/chat/access";
import { checkDraft } from "@/lib/chat/checks";
import { MESSAGES } from "@/lib/messages";
import {
  assertDraftOpen,
  blocksOf,
  currentAdditions,
  currentChanges,
  findOwnDraft,
  proposalsOf,
  readCalendar,
  readChatAccount,
  readGoalRoutines,
} from "@/lib/server/chat/rows";
import { chatProOnly } from "@/lib/server/config";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { EVENT_COLUMNS, toEventDto, type EventRow } from "@/lib/server/events/rows";
import { assertSameOrigin, jsonOk } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { readTimeZone } from "@/lib/server/settings";
import { proOnlyError } from "./send-message";

export function acceptDraft(request: Request, deps: Pick<Deps, "auth" | "withUser" | "now">, id: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    try {
      return await deps.withUser(userId, async (query) => {
        const draft = await findOwnDraft(query, id);
        assertDraftOpen(draft);
        const account = await readChatAccount(query);
        if (!chatAllowed(account.plan, chatProOnly())) throw proOnlyError();

        const now = deps.now();
        const timeZone = await readTimeZone(query);
        const [calendar, goals] = await Promise.all([readCalendar(query, now, timeZone), readGoalRoutines(query)]);
        const outOfDate = () => new ActionError(409, "draft_out_of_date", MESSAGES.draftOutOfDate);
        const changes = currentChanges(draft.changes, calendar, now);
        if (changes === null) throw outOfDate();
        const additions = currentAdditions(draft.added_todos, calendar, now, timeZone);
        if (additions === null) throw outOfDate();
        const proposals = proposalsOf(draft.proposed_events);
        const checked = checkDraft(
          proposals,
          changes,
          { now, timeZone, goalIds: goals.goalIds, calendar: blocksOf(calendar), neverDays: goals.neverDays },
          additions,
        );
        if (!checked.ok) throw outOfDate();

        const created = await query<{ id: string }>("select id from app.chat_apply_draft_todos($1::uuid) as id", [draft.id]);
        // Spec 43: the goal's place for the sessions it created; in this transaction, so all or nothing.
        if (proposals.some((p) => p.goalId !== null && goals.places.has(p.goalId))) {
          await query("select app.chat_place_created_events($1::uuid)", [draft.id]);
        }
        const rows = await query<EventRow>(
          `select ${EVENT_COLUMNS} from app.events where id = any($1::uuid[]) order by start_at, id`,
          [created.map((c) => c.id)],
        );
        const message = changes.length > 0 || additions.length > 0 ? MESSAGES.draftApplied : MESSAGES.draftAccepted;
        return jsonOk({ message, draftId: draft.id, events: rows.map(toEventDto) }, 201);
      });
    } catch (error) {
      // The database's own refusal (a second device got there first between our read and the function).
      const constraint = (error as { constraint?: unknown } | null)?.constraint;
      if (constraint === "draft_plans_status_forward") {
        throw new ActionError(409, "draft_not_open", MESSAGES.draftNotOpen);
      }
      // An event changed between our read and the function's lock.
      if (constraint === "draft_plans_out_of_date") {
        throw new ActionError(409, "draft_out_of_date", MESSAGES.draftOutOfDate);
      }
      throw error;
    }
  });
}
