import { setInviteNotes } from "@/lib/server/actions/event-invites";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/event-invites.ts.
// POST { notes, before }: the shared notes of the accepted invitation's event (spec 55, R66).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return setInviteNotes(request, await realDeps(), id);
}
