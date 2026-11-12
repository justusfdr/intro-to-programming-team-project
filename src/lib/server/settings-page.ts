import "server-only";

// Data for the settings page (spec 12): the settings row, the plan, the Outlook connection's state
// (never the stored access), whether Outlook is set up on this server, and whether demo data is left.
import type { Deps } from "@/lib/server/deps";
import { outlookConfigured } from "@/lib/server/config";
import { hasDemoRows } from "@/lib/server/demo/rows";
import { readOutlookState } from "@/lib/server/outlook/sync";
import { readSettings } from "@/lib/server/settings";
import type { SettingsPageData } from "@/lib/settings/types";
import { localDateOf } from "@/lib/time/zoned";

export async function loadSettingsPage(deps: Pick<Deps, "withUser" | "now">, userId: string): Promise<SettingsPageData> {
  return deps.withUser(userId, async (query) => {
    const settings = await readSettings(query);
    const [profile] = await query<{ plan: "free" | "pro" }>("select plan from app.profiles where id = $1", [userId]);
    return {
      settings,
      plan: profile?.plan ?? "free",
      outlookAvailable: outlookConfigured(),
      outlook: await readOutlookState(query),
      today: localDateOf(deps.now(), settings.timeZone),
      hasDemo: await hasDemoRows(query),
    };
  });
}
