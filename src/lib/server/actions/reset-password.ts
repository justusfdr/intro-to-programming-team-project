import "server-only";

// Action reset_password, the new-password part (ontology section 5). Same steps as sign-up.ts:
// same-origin check, read the body, check the rules, do the work through deps, map each outcome to one answer.
// The link itself is used by confirm-link.ts. Here only a session that a reset link created may set the password,
// and only for 15 minutes; the auth service checks that (src/lib/server/auth/reset-window.ts).
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { checkNewPassword } from "@/lib/server/validation";

// Only the shape is checked here; the length rule has its own ontology message in checkNewPassword.
const ResetPasswordBody = z.object({
  password: z.string().max(1000),
});

export function resetPassword(request: Request, deps: Pick<Deps, "auth">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const body = await readJson(request, ResetPasswordBody);
    if (!body.ok) return body.response;

    checkNewPassword(body.data.password);

    const result = await deps.auth.updatePassword(body.data.password);
    switch (result.kind) {
      case "ok":
        // Every session of the account has ended; the user signs in with the new password.
        return jsonOk({ next: "/sign-in" });
      case "link_expired":
        throw new ActionError(410, "link_expired", MESSAGES.linkExpired);
    }
  });
}
