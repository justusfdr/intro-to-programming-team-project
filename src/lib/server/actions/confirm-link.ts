import "server-only";

// Action confirm_email and the link part of reset_password (ontology section 5).
// The e-mail links to /auth/confirm; the page sends the token here with a POST, so that e-mail
// scanners which only open links do not use it up. Same steps as sign-up.ts.
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import type { LinkKind } from "@/lib/server/auth/types";
import { ActionError, handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";

// "email" is the confirmation link, "recovery" the reset link (setup.md, e-mail templates).
const ConfirmLinkBody = z.object({
  tokenHash: z.string().min(1).max(200),
  type: z.enum(["email", "recovery"]),
});

const KIND_OF_TYPE: Record<"email" | "recovery", LinkKind> = { email: "confirm", recovery: "reset" };

// Where the page goes once the link has worked. A reset link leads to the new-password page.
const NEXT_PAGE: Record<LinkKind, string> = { confirm: "/", reset: "/reset-password" };

export function confirmLink(request: Request, deps: Pick<Deps, "auth">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const body = await readJson(request, ConfirmLinkBody);
    if (!body.ok) return body.response;

    const kind = KIND_OF_TYPE[body.data.type];
    const result = await deps.auth.verifyLink({ tokenHash: body.data.tokenHash, kind });
    switch (result.kind) {
      case "ok":
        return jsonOk({ next: NEXT_PAGE[kind] });
      case "expired":
        throw new ActionError(410, "link_expired", MESSAGES.linkExpired);
    }
  });
}
