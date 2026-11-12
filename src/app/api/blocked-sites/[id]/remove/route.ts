import { removeBlockedSite } from "@/lib/server/actions/remove-blocked-site";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/remove-blocked-site.ts.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return removeBlockedSite(request, await realDeps(), id);
}
