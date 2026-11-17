import { weather } from "@/lib/server/actions/weather";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/weather.ts.
export async function POST(request: Request): Promise<Response> {
  return weather(request, await realDeps());
}
