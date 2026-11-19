import { setInvitePersonal } from "@/lib/server/actions/event-invites";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/event-invites.ts.
// POST { goalId, travelMode, travelFrom }: the invited person's own goal and route (spec 55, R67).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return setInvitePersonal(request, await realDeps(), id);
}
