import "server-only";

// Action add_blocked_site (ontology section 5; spec 05). Same pattern as create_goal:
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the body
//   4. clean the domain (R17), then inside withUser: not listed yet, under 50 sites, write
//   5. one answer per outcome. The database checks the form, duplicates and the 50 again.
import { z } from "zod";
import { cleanDomain } from "@/lib/blocker/domain";
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

const AddSiteBody = z.object({ domain: z.string().max(2000) });

export function addBlockedSite(request: Request, deps: Pick<Deps, "auth" | "withUser">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, AddSiteBody);
    if (!body.ok) return body.response;

    const domain = cleanDomain(body.data.domain);
    if (!domain) throw new ActionError(400, "invalid_site", MESSAGES.invalidSite);

    try {
      return await deps.withUser(userId, async (query) => {
        const [{ listed, count }] = await query<{ listed: boolean; count: number }>(
          "select bool_or(domain = $1) is true as listed, count(*)::int as count from app.blocked_sites",
          [domain],
        );
        if (listed) throw new ActionError(409, "already_listed", MESSAGES.alreadyListed);
        if (count >= 50) throw new ActionError(409, "too_many_sites", MESSAGES.tooManySites);

        const [site] = await query<{ id: string; domain: string }>(
          "insert into app.blocked_sites (domain) values ($1) returning id, domain",
          [domain],
        );
        return jsonOk({ message: MESSAGES.siteAdded, site }, 201);
      });
    } catch (error) {
      // Two additions at the same moment (two devices): the database refuses the second one.
      const message = error instanceof Error ? error.message : "";
      if (message.includes("blocked_sites_once_per_user")) throw new ActionError(409, "already_listed", MESSAGES.alreadyListed);
      if (message.includes("You can block at most 50 sites")) throw new ActionError(409, "too_many_sites", MESSAGES.tooManySites);
      throw error;
    }
  });
}
