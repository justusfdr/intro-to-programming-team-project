import { pendingInviteCount } from "@/lib/server/actions/event-invites";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the reading itself (and its tests) live in src/lib/server/actions/event-invites.ts.
// GET: how many invitations to events the user has not answered yet (the badge on "Calendar", spec 36).
export async function GET(): Promise<Response> {
  return pendingInviteCount(await realDeps());
}
