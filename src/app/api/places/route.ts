import { searchPlaces } from "@/lib/server/actions/search-places";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/search-places.ts.
export async function GET(request: Request): Promise<Response> {
  return searchPlaces(request, await realDeps());
}
