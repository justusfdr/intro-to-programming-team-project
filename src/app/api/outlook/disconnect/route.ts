import { disconnectOutlook } from "@/lib/server/actions/outlook";
import { realDeps } from "@/lib/server/deps";

export async function POST(request: Request): Promise<Response> {
  return disconnectOutlook(request, await realDeps());
}
