import "server-only";

// Actions answer_invitation, withdraw_invitation and remove_contact (ontology section 5; spec 53, from spec 28;
// R53, R54). Each: same-origin check, signed in (R3), a uuid ("Not found" otherwise), then one
// database function that checks the relation itself. Another user's invitation or contact, a missing
// one and a malformed id all get the same "Not found" (R3), and nothing changes (R1).
// Also the badge count (GET): the number of open invitations to the user.
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { handleAction } from "@/lib/server/errors";
import { notFound } from "@/lib/server/events/own-event";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { readInvitationCount } from "@/lib/server/profiles/cards";
import { refusalOf } from "@/lib/server/profiles/refusals";
import { requireUser } from "@/lib/server/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ActionDeps = Pick<Deps, "auth" | "withUser">;

async function callFor(deps: ActionDeps, userId: string, sql: string, params: unknown[]): Promise<void> {
  try {
    await deps.withUser(userId, (query) => query(sql, params));
  } catch (error) {
    refusalOf(error);
  }
}

const AnswerBody = z.object({ accept: z.boolean() });

export function answerInvitation(request: Request, deps: ActionDeps, id: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, AnswerBody);
    if (!body.ok) return body.response;
    if (!UUID.test(id)) throw notFound();

    await callFor(deps, userId, "select app.answer_invitation($1::uuid, $2::boolean)", [id, body.data.accept]);
    return jsonOk({ message: body.data.accept ? MESSAGES.invitationAccepted : MESSAGES.invitationDeclined });
  });
}

export function withdrawInvitation(request: Request, deps: ActionDeps, id: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);
    if (!UUID.test(id)) throw notFound();

    await callFor(deps, userId, "select app.withdraw_invitation($1::uuid)", [id]);
    return jsonOk({ message: MESSAGES.invitationWithdrawn });
  });
}

export function removeContact(request: Request, deps: ActionDeps, id: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);
    if (!UUID.test(id)) throw notFound();

    await callFor(deps, userId, "select app.remove_contact($1::uuid)", [id]);
    return jsonOk({ message: MESSAGES.contactRemoved });
  });
}

/** GET: the number of open invitations to the signed-in user, for the badge on "People". */
export function invitationCount(deps: ActionDeps): Promise<Response> {
  return handleAction(async () => {
    const userId = await requireUser(deps.auth);
    const count = await deps.withUser(userId, readInvitationCount);
    return jsonOk({ count });
  });
}
