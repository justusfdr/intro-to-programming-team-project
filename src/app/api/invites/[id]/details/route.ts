import { acceptedInviteDetails } from "@/lib/server/actions/event-invites";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the reading itself (and its tests) live in src/lib/server/actions/event-invites.ts.
// GET: the full card of the user's accepted invitation (spec 55, R65).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return acceptedInviteDetails(request, await realDeps(), id);
}
