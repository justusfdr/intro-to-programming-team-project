import "server-only";

// Action save_analytics_widgets (spec 49): saves which widgets the user's Analytics page shows on which
// tab and how big they are, or sets it back to the standard layout ("reset").
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the body
//   4. the layout check (src/lib/analytics/layout.ts): refused as a whole, with its message, nothing saved (R1)
//   5. write the user's own settings row   6. answer with the layout and whether it is the standard one
// The database keeps only the shape (a small JSON object); what is allowed is checked here.
import { z } from "zod";
import { checkLayout, standardLayout } from "@/lib/analytics/layout";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

// The layout itself is checked by checkLayout, so here only that it is an object; "reset" must be exactly true.
const Body = z.union([z.strictObject({ layout: z.record(z.string(), z.unknown()) }), z.strictObject({ reset: z.literal(true) })]);

export function saveAnalyticsWidgets(request: Request, deps: Pick<Deps, "auth" | "withUser">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, Body);
    if (!body.ok) return body.response;

    if ("reset" in body.data) {
      await deps.withUser(userId, (query) => query("update app.settings set analytics_widgets = null where user_id = $1", [userId]));
      return jsonOk({ layout: standardLayout(), isStandard: true });
    }

    const checked = checkLayout(body.data.layout);
    if (!checked.ok) throw new ActionError(400, "invalid_analytics_widgets", checked.message);

    await deps.withUser(userId, (query) =>
      query("update app.settings set analytics_widgets = $1::text::jsonb where user_id = $2", [JSON.stringify(checked.layout), userId]),
    );
    return jsonOk({ layout: checked.layout, isStandard: false });
  });
}
