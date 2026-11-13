import { travelTimes } from "@/lib/server/actions/travel-time";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/travel-time.ts.
export async function POST(request: Request): Promise<Response> {
  return travelTimes(request, await realDeps());
}
