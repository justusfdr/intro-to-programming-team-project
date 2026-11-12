import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Announcer } from "@/components/calendar/Announcer";
import { SettingsView } from "@/components/settings/SettingsView";
import { AppShell } from "@/components/shell/AppShell";
import { loadBlocker } from "@/lib/server/blocker/page";
import { pageDeps } from "@/lib/server/deps";
import { loadSettingsPage } from "@/lib/server/settings-page";

export const metadata: Metadata = { title: "Settings" };

/** Every time zone the server knows, so the browser shows the same list the server rendered. */
function knownTimeZones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [];
  }
}

// The settings page (spec 12), in the prototype's layout: one column of cards, Outlook first.
export default async function SettingsPage() {
  const deps = await pageDeps();
  // The proxy already sends signed-out visitors away; the page checks again (R3).
  const userId = await deps.auth.currentUserId();
  if (!userId) redirect("/sign-in");

  const data = await loadSettingsPage(deps, userId);
  const blocker = await loadBlocker(deps, userId);
  const { timeFormat, dayStartHour, dayEndHour } = data.settings;

  return (
    <Announcer>
      <AppShell current="/settings" display={{ timeFormat, dayStartHour, dayEndHour }}>
        <SettingsView data={data} blocker={blocker} timeZones={knownTimeZones()} />
      </AppShell>
    </Announcer>
  );
}
