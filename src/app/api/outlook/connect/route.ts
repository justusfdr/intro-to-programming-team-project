import { startOutlookSignIn } from "@/lib/server/actions/outlook-connect";
import { realDeps } from "@/lib/server/deps";
import { realOutlook } from "@/lib/server/outlook/real";

// Thin wrapper: the action and its tests live in src/lib/server/actions/outlook-connect.ts.
export async function POST(request: Request): Promise<Response> {
  return startOutlookSignIn(request, await realDeps(), realOutlook());
}
