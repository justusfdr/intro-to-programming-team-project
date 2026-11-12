import "server-only";

// Data for the settings page (spec 12): the settings row, the plan, the Outlook connection's state
// (never the stored access), whether Outlook is set up on this server, and whether demo data is left.
import type { Query } from "@/lib/server/db";
import type { Deps } from "@/lib/server/deps";
import { outlookConfigured } from "@/lib/server/config";
import { hasDemoRows } from "@/lib/server/demo/rows";
import { readOutlookState } from "@/lib/server/outlook/sync";
import { readSettings } from "@/lib/server/settings";
import type { SettingsData, SettingsPageData } from "@/lib/settings/types";
import { localDateOf } from "@/lib/time/zoned";

export async function loadSettingsPage(deps: Pick<Deps, "withUser" | "now">, userId: string): Promise<SettingsPageData> {
  return deps.withUser(userId, (query) => readSettingsPage(query, deps.now(), readSettings(query)));
}

/** The same reads inside a transaction that is already open; the settings row may still be on its way. */
export async function readSettingsPage(
  query: Query,
  now: Date,
  settingsRead: SettingsData | Promise<SettingsData>,
): Promise<SettingsPageData> {
  // Started together. Row-level security returns only the user's own profile (auth.uid() is the
  // signed-in user), so the statement needs no parameter and travels with the others.
  const [settings, [profile], outlook, hasDemo] = await Promise.all([
    settingsRead,
    query<{ plan: "free" | "pro" }>("select plan from app.profiles where id = auth.uid()"),
    readOutlookState(query),
    hasDemoRows(query),
  ]);
  return {
    settings,
    plan: profile?.plan ?? "free",
    outlookAvailable: outlookConfigured(),
    outlook,
    today: localDateOf(now, settings.timeZone),
    hasDemo,
  };
}
