import "server-only";

// Event invitations inside the app (spec 36; ontology R59 to R64):
// - set_event_invites (POST /api/events/[id]/invites): the owner sets the invited contacts of one of
//   their events (contact row ids); the answer lists the invited people with their answers;
// - the owner's people of one event (GET /api/events/[id]/invites);
// - answer_event_invite (POST /api/invites/[id]/answer): the invited person answers;
// - the other people of an invitation (GET /api/invites/[id]/people);
// - the invited events of a window (GET /api/invites?from=…&to=…, at most 62 days);
// - the number not answered yet (GET /api/invites/count), for the sidebar's badge on pages that did
//   not read it.
// Each: same-origin check, signed in (R3), uuids only ("Not found" otherwise, the same as for a foreign
// or missing id), then one database function that checks the caller itself. Nothing of the event is
// written by an invited person (R63). Inviting is its own action: create_event and edit_event are
// unchanged.
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { notFound } from "@/lib/server/events/own-event";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { readEventInvitees, readInvitedEvents, readInvitePeople, readPendingInviteCount, cardsOfContacts } from "@/lib/server/invites/read";
import { readPeople } from "@/lib/server/profiles/cards";
import { requireUser } from "@/lib/server/session";
import { GIVEN_ANSWERS, MAX_INVITEES, answeredText, type GivenAnswer } from "@/lib/invites/types";
import { MAX_WINDOW_DAYS } from "@/lib/shares/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** An ISO time with its offset, as the calendar sends it. */
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

type ActionDeps = Pick<Deps, "auth" | "withUser">;

/**
 * The invited contacts, as contact row ids. More than the limit are let through to the database, which
 * answers with the ontology's sentence; far more than that is not a request the screen ever sends.
 */
const SetBody = z.object({ contacts: z.array(z.string().max(40)).max(MAX_INVITEES * 5) });
const AnswerBody = z.object({ answer: z.enum(GIVEN_ANSWERS as [GivenAnswer, ...GivenAnswer[]]) });

/** The database's refusals as answers; anything else goes on unchanged. */
const KNOWN: ReadonlyArray<readonly [string, number, string]> = [
  [MESSAGES.invitesNotInSeries, 409, "invites_series"],
  [MESSAGES.invitesNotOutlook, 409, "invites_outlook"],
  [MESSAGES.invitesNotDemo, 409, "invites_demo"],
  [MESSAGES.invitesNotEnded, 409, "invites_ended"],
  [MESSAGES.tooManyInvitees, 409, "too_many_invitees"],
  [MESSAGES.inviteAnswerChoice, 400, "invite_answer"],
  [MESSAGES.inviteEnded, 409, "invite_ended"],
  [MESSAGES.shareWindow, 400, "invite_window"],
];

function inviteRefusal(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if (message === MESSAGES.notFound) throw notFound();
  for (const [text, status, code] of KNOWN) if (message === text) throw new ActionError(status, code, text);
  throw error;
}

/** POST: the owner sets the invited contacts of their event; answers with the people and their answers. */
export function setEventInvites(request: Request, deps: ActionDeps, eventId: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    const body = await readJson(request, SetBody);
    if (!body.ok) return body.response;
    // A malformed event or contact id is "Not found", like a foreign one (R64).
    if (!UUID.test(eventId) || !body.data.contacts.every((id) => UUID.test(id))) throw notFound();
    try {
      const people = await deps.withUser(userId, async (query) => {
        await query("select app.set_event_invites($1::uuid, $2::uuid[])", [eventId, body.data.contacts]);
        return readEventInvitees(query, eventId);
      });
      return jsonOk({ message: MESSAGES.invitesSaved, people });
    } catch (error) {
      inviteRefusal(error);
    }
  });
}

/** GET: the owner's people of one event, with their answers. */
export function eventInvitees(request: Request, deps: ActionDeps, eventId: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    if (!UUID.test(eventId)) throw notFound();
    try {
      const people = await deps.withUser(userId, (query) => readEventInvitees(query, eventId));
      return jsonOk({ people });
    } catch (error) {
      inviteRefusal(error);
    }
  });
}

/** POST: the invited person answers (accepted, tentative or declined). */
export function answerEventInvite(request: Request, deps: ActionDeps, inviteId: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    const body = await readJson(request, AnswerBody);
    if (!body.ok) return body.response;
    if (!UUID.test(inviteId)) throw notFound();
    try {
      await deps.withUser(userId, (query) => query("select app.answer_event_invite($1::uuid, $2::text)", [inviteId, body.data.answer]));
    } catch (error) {
      inviteRefusal(error);
    }
    return jsonOk({ message: answeredText(body.data.answer), answer: body.data.answer });
  });
}

/** GET: the other people of the user's invitation, with their answers (names and photos only). */
export function invitePeople(request: Request, deps: ActionDeps, inviteId: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    if (!UUID.test(inviteId)) throw notFound();
    try {
      const people = await deps.withUser(userId, (query) => readInvitePeople(query, inviteId));
      return jsonOk({ people });
    } catch (error) {
      inviteRefusal(error);
    }
  });
}

/** A time from the address, or null when it is missing or not a full ISO time. */
function timeParam(value: string | null): Date | null {
  if (value === null || !ISO_TIME.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** GET: the events between `from` and `to` (at most 62 days) the user is invited to. */
export function invitedEvents(request: Request, deps: ActionDeps): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    const params = new URL(request.url).searchParams;
    const from = timeParam(params.get("from"));
    const to = timeParam(params.get("to"));
    if (!from || !to || to <= from || to.getTime() - from.getTime() > MAX_WINDOW_DAYS * DAY_MS) {
      throw new ActionError(400, "invite_window", MESSAGES.shareWindow);
    }
    try {
      const events = await deps.withUser(userId, async (query) => {
        const people = await readPeople(query);
        return readInvitedEvents(query, from, to, cardsOfContacts(people.contacts));
      });
      return jsonOk({ events });
    } catch (error) {
      inviteRefusal(error);
    }
  });
}

/** GET: how many invitations the user has not answered yet (the badge on "Calendar"). */
export function pendingInviteCount(deps: ActionDeps): Promise<Response> {
  return handleAction(async () => {
    const userId = await requireUser(deps.auth);
    const count = await deps.withUser(userId, readPendingInviteCount);
    return jsonOk({ count });
  });
}
