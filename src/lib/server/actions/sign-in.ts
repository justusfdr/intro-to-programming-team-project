import "server-only";

// Action sign_in (ontology section 5). Same steps as sign-up.ts:
// same-origin check, read the body, check the rules, do the work through deps, map each outcome to one answer.
// The 8-character rule of sign_up is not checked here: an old short password must still get
// "Email or password is wrong".
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import { checkAccountAttempt, countWrongPassword } from "@/lib/server/actions/account-limits";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { normalizeEmail } from "@/lib/server/validation";

const SignInBody = z.object({
  email: z.string(),
  password: z.string().min(1).max(1000),
});

export function signIn(request: Request, deps: Pick<Deps, "auth" | "now">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const body = await readJson(request, SignInBody);
    if (!body.ok) return body.response;

    const email = normalizeEmail(body.data.email);
    checkAccountAttempt(request, "sign_in", email, deps.now());
    const result = await deps.auth.signIn({ email, password: body.data.password });
    switch (result.kind) {
      case "signed_in":
        return jsonOk({ next: "/" });
      case "wrong_credentials":
        // Spec 50: only wrong passwords count towards the sign-in limit.
        countWrongPassword(request, email, deps.now());
        throw new ActionError(401, "wrong_credentials", MESSAGES.wrongCredentials);
      case "unconfirmed":
        throw new ActionError(403, "unconfirmed", MESSAGES.unconfirmed);
    }
  });
}
