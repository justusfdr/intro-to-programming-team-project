import "server-only";

// Action invite_contact (ontology section 5; spec 53, from spec 28; R52).
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the body
//   4. a plain e-mail address ("Enter a valid email address"); the in-memory brake per user
//      (429, account-limits.ts)
//   5. inside withUser: app.invite_contact, which refuses only what does not depend on the address
//      (the user's own address, the user's limits) and does everything else silently
//   6. always the same answer: "If this person uses LockedIn, they will see your invitation."
//
// No account enumeration: whether the address has an account, is already a contact, has a pending
// invitation or declined within 30 days never changes the status, the body or the error path. The
// database function swallows every error of the part that depends on the address; the only errors
// left are the user's own refusals and a database that is down, which do not depend on it either.
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import { cleanGuest } from "@/lib/events/guests";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { checkInviteAttempt } from "@/lib/server/actions/account-limits";
import { refusalOf } from "@/lib/server/profiles/refusals";
import { requireUser } from "@/lib/server/session";

const Body = z.object({ email: z.string().max(1000) });

export function inviteContact(request: Request, deps: Pick<Deps, "auth" | "withUser" | "now">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, Body);
    if (!body.ok) return body.response;

    // The same plain-address rule as an event's guests (lower-case, at most 254 characters).
    const email = cleanGuest(body.data.email);
    if (!email) throw new ActionError(400, "invalid_email", MESSAGES.invalidEmail);

    checkInviteAttempt(request, userId, deps.now());

    try {
      await deps.withUser(userId, (query) => query("select app.invite_contact($1::text)", [email]));
    } catch (error) {
      refusalOf(error);
    }
    return jsonOk({ message: MESSAGES.invited });
  });
}
