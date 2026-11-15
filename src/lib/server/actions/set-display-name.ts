import "server-only";

// Action set_display_name (ontology section 5; spec 28, R42).
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the body   4. clean the name
//   5. inside withUser: app.set_display_name, which checks the rule again and writes only the user's
//      own display name (the user has no other write right on app.profiles, R6).
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import { cleanDisplayName } from "@/lib/profiles/display-name";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { refusalOf } from "@/lib/server/profiles/refusals";
import { requireUser } from "@/lib/server/session";

const Body = z.object({ displayName: z.string().max(1000) });

export function setDisplayName(request: Request, deps: Pick<Deps, "auth" | "withUser">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, Body);
    if (!body.ok) return body.response;

    const name = cleanDisplayName(body.data.displayName);
    if (!name) throw new ActionError(400, "invalid_name", MESSAGES.displayName);

    try {
      await deps.withUser(userId, (query) => query("select app.set_display_name($1::text)", [name]));
    } catch (error) {
      refusalOf(error);
    }
    return jsonOk({ message: MESSAGES.nameSaved, displayName: name });
  });
}
