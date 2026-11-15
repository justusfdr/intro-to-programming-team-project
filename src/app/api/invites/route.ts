import { invitedEvents } from "@/lib/server/actions/event-invites";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the reading itself (and its tests) live in src/lib/server/actions/event-invites.ts.
// GET /api/invites?from=…&to=…: the events of that window (at most 62 days) the user is invited to (spec 36).
export async function GET(request: Request): Promise<Response> {
  return invitedEvents(request, await realDeps());
}
