import "server-only";

// Action sign_up (ontology section 5). Reference pattern for every action:
//   1. same-origin check   2. read and shape-check the body   3. rules with their ontology messages
//   4. do the work through deps   5. map each outcome to one answer.
// A rejected action returns before anything is written (R1).
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import { checkAccountAttempt } from "@/lib/server/actions/account-limits";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { checkNewPassword, normalizeEmail, resolveTimeZone } from "@/lib/server/validation";

const SignUpBody = z.object({
  email: z.string(),
  password: z.string(),
  // From the browser (Intl). Optional: a missing or unknown zone falls back to Europe/Lisbon.
  timeZone: z.string().optional(),
});

export function signUp(request: Request, deps: Pick<Deps, "auth" | "now">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const body = await readJson(request, SignUpBody);
    if (!body.ok) return body.response;

    const email = normalizeEmail(body.data.email);
    checkNewPassword(body.data.password);
    const timeZone = resolveTimeZone(body.data.timeZone);
    checkAccountAttempt(request, "sign_up", email, deps.now());

    const result = await deps.auth.signUp({ email, password: body.data.password, timeZone });
    switch (result.kind) {
      case "created":
        return jsonOk({ message: MESSAGES.signUpDone }, 201);
      case "email_taken":
        throw new ActionError(409, "email_taken", MESSAGES.emailTaken);
      case "email_failed":
        throw new ActionError(503, "email_failed", MESSAGES.emailDown);
    }
  });
}
