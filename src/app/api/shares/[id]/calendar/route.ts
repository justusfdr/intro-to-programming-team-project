import { sharedCalendar } from "@/lib/server/actions/shares";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the reading itself (and its tests) live in src/lib/server/actions/shares.ts.
// GET /api/shares/[owner's user id]/calendar?from=…&to=…
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return sharedCalendar(request, await realDeps(), id);
}
