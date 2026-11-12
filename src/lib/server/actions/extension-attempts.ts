import "server-only";

// record_attempt (ontology, "By itself"): the extension reports pages it stopped (R16).
//   1. only from our extension (origin rule)   2. signed in   3. read and shape-check the body
//   4. keep only attempts for domains on the user's list, timed from 48 hours ago to one minute
//      ahead (the extension may send them later), and store them. The database also drops anything
//      over 500 a day without an error. Attempts that do not fit are dropped silently.
import { z } from "zod";
import type { Deps } from "@/lib/server/deps";
import { handleAction } from "@/lib/server/errors";
import { assertFromExtension } from "@/lib/server/blocker/extension-request";
import { readBlockedSites } from "@/lib/server/blocker/load";
import { jsonOk, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

const AttemptsBody = z.object({
  attempts: z.array(z.object({ domain: z.string().max(253), attemptedAt: z.string().max(40) })).max(50),
});

const EARLIEST_MS = 48 * 60 * 60 * 1000;
const LATEST_MS = 60 * 1000;

export function extensionAttempts(request: Request, deps: Pick<Deps, "auth" | "withUser" | "now">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertFromExtension(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, AttemptsBody);
    if (!body.ok) return body.response;

    const now = deps.now().getTime();
    return deps.withUser(userId, async (query) => {
      const listed = new Set((await readBlockedSites(query)).map((site) => site.domain));
      let saved = 0;
      for (const attempt of body.data.attempts) {
        const at = Date.parse(attempt.attemptedAt);
        if (!listed.has(attempt.domain) || !Number.isFinite(at) || at < now - EARLIEST_MS || at > now + LATEST_MS) continue;
        const rows = await query("insert into app.blocked_attempts (domain, attempted_at) values ($1, $2) returning id", [
          attempt.domain,
          new Date(at),
        ]);
        saved += rows.length; // 0 when the daily cap dropped it
      }
      return jsonOk({ saved });
    });
  });
}
