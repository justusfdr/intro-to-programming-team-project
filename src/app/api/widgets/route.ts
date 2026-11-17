import { saveWidgets } from "@/lib/server/actions/save-widgets";
import { widgetsData } from "@/lib/server/actions/widgets-data";
import { realDeps } from "@/lib/server/deps";

// Thin wrappers: the actions (and their tests) live in src/lib/server/actions/widgets-data.ts and save-widgets.ts.
export async function GET(): Promise<Response> {
  return widgetsData(await realDeps());
}

export async function POST(request: Request): Promise<Response> {
  return saveWidgets(request, await realDeps());
}
