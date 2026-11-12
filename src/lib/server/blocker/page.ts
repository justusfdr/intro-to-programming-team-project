import "server-only";

// Data for the blocker section of the Focus page: the block list, whether the extension asked in
// the last 2 minutes (R18), and whether blocking is on now (R15).
import type { Query } from "@/lib/server/db";
import type { Deps } from "@/lib/server/deps";
import { settleSessions } from "@/lib/server/focus/sessions";
import { readTimeZone } from "@/lib/server/settings";
import type { BlockerData } from "@/lib/blocker/types";
import { readBlockedSites, readBlockingState, readExtensionConnected } from "./load";

export async function loadBlocker(deps: Pick<Deps, "withUser" | "now">, userId: string): Promise<BlockerData> {
  const now = deps.now();
  await settleSessions(deps, userId, now);
  return deps.withUser(userId, (query) => readBlocker(query, now, readTimeZone(query)));
}

/** The same reads inside a transaction that is already open; call settleSessions before it. */
export async function readBlocker(query: Query, now: Date, timeZoneRead: string | Promise<string>): Promise<BlockerData> {
  // Started together: the two without parameters first, the blocking state (which has one) last.
  const [sites, connected, state, timeZone] = await Promise.all([
    readBlockedSites(query),
    readExtensionConnected(query),
    readBlockingState(query, now),
    timeZoneRead,
  ]);
  return {
    sites,
    connected,
    blockingOn: state.blockingOn,
    blockingUntil: state.blockingUntil ? state.blockingUntil.toISOString() : null,
    timeZone,
  };
}
