import "server-only";

// Action start_fresh ("Start fresh" in the welcome, ontology section 5; spec 13). Always allowed.
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the (empty) body
//   4. inside withUser: mark the welcome as answered; nothing else changes   5. one answer.
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

const Empty = z.strictObject({});

export function startFresh(request: Request, deps: Pick<Deps, "auth" | "withUser">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, Empty);
    if (!body.ok) return body.response;

    return deps.withUser(userId, async (query) => {
      await query("update app.settings set welcome_answered = true");
      return jsonOk({ message: MESSAGES.welcomeAnswered });
    });
  });
}
