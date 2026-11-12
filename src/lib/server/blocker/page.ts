import "server-only";

// Data for the blocker section of the Focus page: the block list, whether the extension asked in
// the last 2 minutes (R18), and whether blocking is on now (R15).
import type { Deps } from "@/lib/server/deps";
import { settleSessions } from "@/lib/server/focus/sessions";
import { readTimeZone } from "@/lib/server/settings";
import type { BlockerData } from "@/lib/blocker/types";
import { readBlockedSites, readBlockingState, readExtensionConnected } from "./load";

export async function loadBlocker(deps: Pick<Deps, "withUser" | "now">, userId: string): Promise<BlockerData> {
  const now = deps.now();
  await settleSessions(deps, userId, now);
  return deps.withUser(userId, async (query) => {
    const state = await readBlockingState(query, now);
    return {
      sites: await readBlockedSites(query),
      connected: await readExtensionConnected(query),
      blockingOn: state.blockingOn,
      blockingUntil: state.blockingUntil ? state.blockingUntil.toISOString() : null,
      timeZone: await readTimeZone(query),
    };
  });
}
