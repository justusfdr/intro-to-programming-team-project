import { addBlockedSite } from "@/lib/server/actions/add-blocked-site";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/add-blocked-site.ts.
export async function POST(request: Request): Promise<Response> {
  return addBlockedSite(request, await realDeps());
}
