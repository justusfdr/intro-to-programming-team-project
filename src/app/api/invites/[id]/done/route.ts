import { setInviteDone } from "@/lib/server/actions/event-invites";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/event-invites.ts.
// POST { done }: the invited person marks the event done for themselves (spec 55, R67).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return setInviteDone(request, await realDeps(), id);
}
