import { addPlace } from "@/lib/server/actions/saved-places";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/saved-places.ts.
export async function POST(request: Request): Promise<Response> {
  return addPlace(request, await realDeps());
}
