import "server-only";

// Action sign_out (ontology section 5). Same steps as sign-up.ts, except that there is no body to read.
// It answers the same way with or without a session.
import type { Deps } from "@/lib/server/deps";
import { handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk } from "@/lib/server/http";

export function signOut(request: Request, deps: Pick<Deps, "auth">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    await deps.auth.signOut();
    return jsonOk({ next: "/sign-in" });
  });
}
