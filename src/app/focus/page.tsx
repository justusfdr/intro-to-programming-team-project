import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Announcer } from "@/components/calendar/Announcer";
import { FocusView } from "@/components/focus/FocusView";
import { AppShell } from "@/components/shell/AppShell";
import { pageDeps } from "@/lib/server/deps";
import { readDisplay } from "@/lib/server/settings";
import { loadBlocker } from "@/lib/server/blocker/page";
import { loadFocus } from "@/lib/server/focus/load";

export const metadata: Metadata = { title: "Focus" };

// The Focus page (spec 04). Opened from an event as /focus?event=<id>.
export default async function FocusPage({ searchParams }: { searchParams: Promise<{ event?: string | string[] }> }) {
  const deps = await pageDeps();
  // The proxy already sends signed-out visitors away; the page checks again (R3).
  const userId = await deps.auth.currentUserId();
  if (!userId) redirect("/sign-in");
  const display = await deps.withUser(userId, readDisplay);

  const { event } = await searchParams;
  const data = await loadFocus(deps, userId, typeof event === "string" ? event : undefined);
  const blocker = await loadBlocker(deps, userId);

  return (
    <Announcer>
      <AppShell current="/focus" display={display}>
        <FocusView data={data} blocker={blocker} />
      </AppShell>
    </Announcer>
  );
}
