import "server-only";

// Action delete_account (ontology section 5; spec 12):
//   1. same-origin check   2. signed in (R3)   3. the typed confirmation "DELETE"
//   4. inside withUser: plan Free, else "Cancel Pro before deleting your account"; then the database
//      function app.delete_account() deletes the sign-in account, and every row of the user goes with it.
//      Pro that is already cancelled stays Pro until its paid period ends, so the answer then says that
//      date instead (Issue #131): "Pro is cancelled and ends on 16 December 2026. ..."
//   5. the session ends and the page goes to the sign-in page.
// The database function checks the plan again and can only ever delete the signed-in user.
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { proEndsOn } from "@/lib/server/actions/billing";
import { ActionError, handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

/** What the user types to confirm. */
export const DELETE_CONFIRMATION = "DELETE";

const DeleteBody = z.strictObject({ confirm: z.string().max(100) });

/**
 * The answer while the plan is still Pro. When Stripe says Pro is set to end, the user has already
 * cancelled: the answer names the day it ends. Otherwise (still renews, no Stripe, Stripe slow) the
 * usual "Cancel Pro before deleting your account". proEndsOn never throws and waits at most 2 seconds.
 */
async function stillPro(deps: Pick<Deps, "withUser" | "stripe">, userId: string): Promise<ActionError> {
  const endsOn = await proEndsOn(deps, userId);
  return new ActionError(409, "cancel_pro", endsOn ? MESSAGES.deleteAfterProEnds(endsOn) : MESSAGES.cancelPro);
}

export function deleteAccount(request: Request, deps: Pick<Deps, "auth" | "withUser" | "stripe">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, DeleteBody);
    if (!body.ok) return body.response;
    if (body.data.confirm.trim() !== DELETE_CONFIRMATION) throw new ActionError(400, "confirm", MESSAGES.typeDelete);

    try {
      await deps.withUser(userId, async (query) => {
        const [profile] = await query<{ plan: string }>("select plan from app.profiles where id = $1", [userId]);
        if (profile && profile.plan !== "free") throw new ActionError(409, "cancel_pro", MESSAGES.cancelPro);
        await query("select app.delete_account()");
      });
    } catch (error) {
      // Pro, or the plan changed between the check and the delete (the database refuses it). Stripe is
      // asked only here, after withUser has finished, so no database connection waits for it.
      const pro = error instanceof ActionError ? error.code === "cancel_pro" : error instanceof Error && error.message.includes(MESSAGES.cancelPro);
      if (pro) throw await stillPro(deps, userId);
      throw error;
    }

    await deps.auth.signOut();
    return jsonOk({ message: MESSAGES.accountDeleted, next: "/sign-in" });
  });
}
