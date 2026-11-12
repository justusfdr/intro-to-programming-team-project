import { finishOutlookSignIn } from "@/lib/server/actions/outlook-connect";
import { realDeps } from "@/lib/server/deps";
import { realOutlook } from "@/lib/server/outlook/real";

// Microsoft sends the browser here after its sign-in (the address registered in docs/setup.md).
export async function GET(request: Request): Promise<Response> {
  return finishOutlookSignIn(request, await realDeps(), realOutlook());
}
