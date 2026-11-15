import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Announcer } from "@/components/calendar/Announcer";
import { LiveProvider } from "@/components/live/Live";
import { SettingsView } from "@/components/settings/SettingsView";
import { AppShell } from "@/components/shell/AppShell";
import { pageDeps } from "@/lib/server/deps";
import { loadSettingsPageWithProfile } from "@/lib/server/pages/load";

export const metadata: Metadata = { title: "Settings" };

// The settings page (spec 12), in the prototype's layout: one column of cards, Outlook first.
export default async function SettingsPage() {
  const deps = await pageDeps();
  // The proxy already sends signed-out visitors away; the page checks again (R3).
  const userId = await deps.auth.currentUserId();
  if (!userId) redirect("/sign-in");

  // Everything in one transaction (src/lib/server/pages/load.ts).
  const { display, page: data, blocker, profile } = await loadSettingsPageWithProfile(deps, userId);

  return (
    <Announcer>
      <LiveProvider>
        <AppShell current="/settings" display={display}>
          <SettingsView data={data} blocker={blocker} profile={profile} />
        </AppShell>
      </LiveProvider>
    </Announcer>
  );
}
