import { confirmLink } from "@/lib/server/actions/confirm-link";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/confirm-link.ts.
export async function POST(request: Request): Promise<Response> {
  return confirmLink(request, await realDeps());
}
