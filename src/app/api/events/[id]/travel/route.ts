import { travelTime } from "@/lib/server/actions/travel-time";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/travel-time.ts.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return travelTime(request, await realDeps(), id);
}
