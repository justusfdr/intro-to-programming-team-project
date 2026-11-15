import { answerEventInvite } from "@/lib/server/actions/event-invites";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/event-invites.ts.
// POST { answer: "accepted" | "tentative" | "declined" } for the invitation with this id (spec 36).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return answerEventInvite(request, await realDeps(), id);
}
