import { eventInvitees, setEventInvites } from "@/lib/server/actions/event-invites";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the actions themselves (and their tests) live in src/lib/server/actions/event-invites.ts.
// GET: the owner's invited people of this event. POST { contacts: [contact row ids] }: sets them (spec 36).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return eventInvitees(request, await realDeps(), id);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return setEventInvites(request, await realDeps(), id);
}
