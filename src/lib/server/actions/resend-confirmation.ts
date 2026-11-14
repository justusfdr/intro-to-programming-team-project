import "server-only";

// Action resend_confirmation (ontology section 5). Same steps as sign-up.ts:
// same-origin check, read the body, check the rules, do the work through deps, map each outcome to one answer.
// The answer for "sent" is the same for unconfirmed, confirmed and unknown addresses (R30).
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import { checkAccountAttempt } from "@/lib/server/actions/account-limits";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { normalizeEmail } from "@/lib/server/validation";

const ResendBody = z.object({
  email: z.string(),
});

export function resendConfirmation(request: Request, deps: Pick<Deps, "auth" | "now">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const body = await readJson(request, ResendBody);
    if (!body.ok) return body.response;

    const email = normalizeEmail(body.data.email);
    checkAccountAttempt(request, "resend_confirmation", email, deps.now());
    const result = await deps.auth.resendConfirmation(email);
    switch (result.kind) {
      case "sent":
        return jsonOk({ message: MESSAGES.resendSent });
      case "too_soon":
        throw new ActionError(429, "too_soon", MESSAGES.resendTooSoon);
      case "email_failed":
        throw new ActionError(503, "email_failed", MESSAGES.emailDown);
    }
  });
}
