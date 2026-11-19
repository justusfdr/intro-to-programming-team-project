import { inviteTravelTime } from "@/lib/server/actions/event-invites";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/event-invites.ts.
// GET (?mode=…&from=…): when to leave for the accepted invitation's event, on the invited person's own route (spec 55, R67).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return inviteTravelTime(request, await realDeps(), id);
}
