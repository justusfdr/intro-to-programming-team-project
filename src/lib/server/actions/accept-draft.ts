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
// Spec 37 (R67, R68): a proposed event may invite people (contact row ids, and demo contacts apart).
// Before anything is written, each of them must still share their calendar with the user (read fresh
// through the shares) and the event's time, also after a drag, must not overlap any of their busy times
// ("<name> no longer shares their calendar with you" / "The time no longer fits <name>"). After
// app.chat_apply_draft_todos has created the events, app.set_event_invites invites the real contacts to
// each of them, in this same transaction: if any invitation fails (no longer a contact, the 20 limit,
// any refusal of the database), the whole transaction rolls back, so no event is created and the draft
// stays open (R1). Demo contacts are never invited. Undo deletes the events, and their invitations
// with them (the table's foreign key).
import { chatAllowed } from "@/lib/chat/access";
import { checkDraft, type Proposal } from "@/lib/chat/checks";
import { fitsBusy, noLongerFitsMessage, notSharingMessage } from "@/lib/chat/people";
import { demoPerson, isDemoId } from "@/lib/demo/people";
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
} from "@/lib/server/chat/rows";
import { readBusy, readCoachCandidates } from "@/lib/server/chat/people";
import { chatProOnly } from "@/lib/server/config";
import type { Query } from "@/lib/server/db";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { EVENT_COLUMNS, toEventDto, type EventRow } from "@/lib/server/events/rows";
import { assertSameOrigin, jsonOk } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { readTimeZone } from "@/lib/server/settings";
import { proOnlyError } from "./send-message";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Invitations the database refused, as the sentence the person sees; null for anything else. */
const INVITE_REFUSALS: readonly string[] = [
  MESSAGES.tooManyInvitees,
  MESSAGES.invitesNotEnded,
  MESSAGES.invitesNotInSeries,
  MESSAGES.invitesNotOutlook,
  MESSAGES.invitesNotDemo,
];

/** Thrown inside the transaction when inviting fails, so everything rolls back; turned into the answer outside. */
class InviteRefusal extends Error {}

/**
 * Spec 37 (R67, R68): every person a proposal invites still shares their calendar with the user, and
 * the proposal's time (as it is now, also after a drag) fits their busy times read at this moment.
 * Throws the refusal; nothing has been written yet.
 */
async function checkInvitedPeople(query: Query, proposals: readonly Proposal[]): Promise<void> {
  const keys = [...new Set(proposals.flatMap((p) => p.people ?? []))];
  if (keys.length === 0) return;
  const { candidates, contacts } = await readCoachCandidates(query);
  for (const key of keys) {
    const candidate = candidates.find((c) => c.key === key);
    if (!candidate) {
      const name = isDemoId(key) ? demoPerson(key)?.name : contacts.find((c) => c.id === key)?.name;
      throw new ActionError(409, "invitee_not_sharing", name ? notSharingMessage(name) : MESSAGES.draftInviteeGone);
    }
    const times = proposals.filter((p) => p.people?.includes(key));
    const from = new Date(Math.min(...times.map((p) => p.startAt.getTime())));
    const until = new Date(Math.max(...times.map((p) => p.endAt.getTime())));
    const busy = await readBusy(query, candidate, from, until);
    if (times.some((p) => !fitsBusy(p, busy))) throw new ActionError(409, "invitee_busy", noLongerFitsMessage(candidate.name));
  }
}

/**
 * Spec 37: invites the real contacts of each proposal to the event created for it. Proposals never
 * overlap each other (R23), so each one's start finds its event.
 */
async function inviteToCreated(query: Query, proposals: readonly Proposal[], created: readonly { id: string; start_at: Date | string | null }[]): Promise<number> {
  let invited = 0;
  for (const proposal of proposals) {
    const contacts = (proposal.people ?? []).filter((key) => UUID.test(key));
    if (contacts.length === 0) continue;
    const event = created.find((e) => e.start_at !== null && new Date(e.start_at).getTime() === proposal.startAt.getTime());
    if (!event) throw new InviteRefusal(MESSAGES.draftOutOfDate);
    try {
      await query("select app.set_event_invites($1::uuid, $2::uuid[])", [event.id, contacts]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === MESSAGES.notFound) throw new InviteRefusal(MESSAGES.draftInviteeGone);
      throw new InviteRefusal(INVITE_REFUSALS.includes(message) ? message : MESSAGES.draftInviteFailed);
    }
    invited += contacts.length;
  }
  return invited;
}

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
        const [calendar, goals] = await Promise.all([
          readCalendar(query, now, timeZone),
          query<{ id: string }>("select id from app.goals"),
        ]);
        const outOfDate = () => new ActionError(409, "draft_out_of_date", MESSAGES.draftOutOfDate);
        const changes = currentChanges(draft.changes, calendar, now);
        if (changes === null) throw outOfDate();
        const additions = currentAdditions(draft.added_todos, calendar, now, timeZone);
        if (additions === null) throw outOfDate();
        const proposals = proposalsOf(draft.proposed_events);
        const checked = checkDraft(
          proposals,
          changes,
          { now, timeZone, goalIds: new Set(goals.map((g) => g.id)), calendar: blocksOf(calendar) },
          additions,
        );
        if (!checked.ok) throw outOfDate();
        // Spec 37: the invited people, fresh, before anything is written.
        await checkInvitedPeople(query, proposals);

        const created = await query<{ id: string }>("select id from app.chat_apply_draft_todos($1::uuid) as id", [draft.id]);
        const rows = await query<EventRow>(
          `select ${EVENT_COLUMNS} from app.events where id = any($1::uuid[]) order by start_at, id`,
          [created.map((c) => c.id)],
        );
        // Spec 37: in the same transaction; a failure rolls back the events too.
        const invited = await inviteToCreated(query, proposals, rows);
        const base = changes.length > 0 || additions.length > 0 ? MESSAGES.draftApplied : MESSAGES.draftAccepted;
        const message = invited > 0 ? `${base} ${MESSAGES.draftInvitesSent}` : base;
        return jsonOk({ message, draftId: draft.id, events: rows.map(toEventDto) }, 201);
      });
    } catch (error) {
      // Spec 37: inviting failed; the transaction has rolled back (no event, the draft still open).
      if (error instanceof InviteRefusal) throw new ActionError(409, "invite_failed", error.message);
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
