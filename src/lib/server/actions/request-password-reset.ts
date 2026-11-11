import "server-only";

// Action request_password_reset (ontology section 5). Same steps as sign-up.ts:
// same-origin check, read the body, check the rules, do the work through deps, map each outcome to one answer.
// The answer is neutral: it never tells whether an address has an account (R30, A14).
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { normalizeEmail } from "@/lib/server/validation";

const RequestResetBody = z.object({
  email: z.string(),
});

export function requestPasswordReset(request: Request, deps: Pick<Deps, "auth">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const body = await readJson(request, RequestResetBody);
    if (!body.ok) return body.response;

    // An address that is not an email gets the same neutral answer as any other, and nothing is sent.
    let email: string;
    try {
      email = normalizeEmail(body.data.email);
    } catch (error) {
      if (error instanceof ActionError && error.code === "invalid_email") {
        return jsonOk({ message: MESSAGES.resetRequested });
      }
      throw error;
    }

    const result = await deps.auth.requestPasswordReset(email);
    switch (result.kind) {
      case "sent":
        return jsonOk({ message: MESSAGES.resetRequested });
      case "email_failed":
        throw new ActionError(503, "email_failed", MESSAGES.emailDown);
    }
  });
}
