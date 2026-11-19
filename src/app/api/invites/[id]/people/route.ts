import { invitePeople } from "@/lib/server/actions/event-invites";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the reading itself (and its tests) live in src/lib/server/actions/event-invites.ts.
// GET: the other people invited to the same event, with their answers (spec 54, from spec 36).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return invitePeople(request, await realDeps(), id);
}
