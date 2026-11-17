import "server-only";

// Action save_widgets (spec 47, R47): saves the user's list of sidebar widgets, or sets it back to the
// standard one ("reset").
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the body
//   4. R47 (src/lib/widgets/layout.ts): refused as a whole, with its message, nothing saved
//   5. write the user's own settings row   6. answer with the list and whether it is the standard one
// The database keeps only the shape (a list of at most 18) again; which kinds and sizes are allowed is checked here.
import { z } from "zod";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { checkLayout } from "@/lib/widgets/layout";
import { DEFAULT_LAYOUT } from "@/lib/widgets/types";

// The list itself is checked by R47, so here only that it is a list; "reset" must be exactly true.
const WidgetsBody = z.union([z.strictObject({ layout: z.array(z.unknown()) }), z.strictObject({ reset: z.literal(true) })]);

export function saveWidgets(request: Request, deps: Pick<Deps, "auth" | "withUser">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, WidgetsBody);
    if (!body.ok) return body.response;

    if ("reset" in body.data) {
      await deps.withUser(userId, (query) => query("update app.settings set widgets = null where user_id = $1", [userId]));
      return jsonOk({ layout: DEFAULT_LAYOUT.map((item) => ({ ...item })), isDefault: true });
    }

    const checked = checkLayout(body.data.layout);
    if (!checked.ok) throw new ActionError(400, "invalid_widgets", checked.message);

    await deps.withUser(userId, (query) =>
      query("update app.settings set widgets = $1::text::jsonb where user_id = $2", [JSON.stringify(checked.layout), userId]),
    );
    return jsonOk({ layout: checked.layout, isDefault: false });
  });
}
