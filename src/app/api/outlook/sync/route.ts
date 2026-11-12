import { syncOutlookNow } from "@/lib/server/actions/outlook";
import { realDeps } from "@/lib/server/deps";
import { realOutlook } from "@/lib/server/outlook/real";

export async function POST(request: Request): Promise<Response> {
  return syncOutlookNow(request, await realDeps(), realOutlook());
}
