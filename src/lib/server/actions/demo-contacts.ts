import "server-only";

// Switching the demo contacts on and off (spec 32): "Add demo contacts" and "Remove demo contacts" on the
// People page. POST /api/demo/contacts with { on: true } or { on: false }.
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the body
//   4. inside withUser: app.set_demo_contacts, which writes only the user's own choice (R6).
// Nothing else changes: the demo contacts are not accounts, contacts or shares, so there is nothing to
// create or delete.
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

const Body = z.strictObject({ on: z.boolean() });

export function setDemoContacts(request: Request, deps: Pick<Deps, "auth" | "withUser">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, Body);
    if (!body.ok) return body.response;

    await deps.withUser(userId, (query) => query("select app.set_demo_contacts($1::boolean)", [body.data.on]));
    return jsonOk({ message: body.data.on ? MESSAGES.demoContactsAdded : MESSAGES.demoContactsRemoved, on: body.data.on });
  });
}
