import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Announcer } from "@/components/calendar/Announcer";
import { FocusView } from "@/components/focus/FocusView";
import { AppShell } from "@/components/shell/AppShell";
import { teasersFor } from "@/lib/library/library";
import { pageDeps } from "@/lib/server/deps";
import { loadFocusPage } from "@/lib/server/pages/load";
import { localDateOf } from "@/lib/time/zoned";

export const metadata: Metadata = { title: "Focus" };

// The Focus page (spec 04). Opened from an event as /focus?event=<id>.
export default async function FocusPage({ searchParams }: { searchParams: Promise<{ event?: string | string[] }> }) {
  const deps = await pageDeps();
  // The proxy already sends signed-out visitors away; the page checks again (R3).
  const userId = await deps.auth.currentUserId();
  if (!userId) redirect("/sign-in");

  const { event } = await searchParams;
  // Everything in one transaction (src/lib/server/pages/load.ts).
  const { display, focus: data, blocker } = await loadFocusPage(deps, userId, typeof event === "string" ? event : undefined);

  return (
    <Announcer>
      <AppShell current="/focus" display={display}>
        {/* Three articles of the library, the same all day in the user's time zone (spec 29). */}
        <FocusView data={data} blocker={blocker} library={teasersFor(localDateOf(new Date(data.now), blocker.timeZone))} />
      </AppShell>
    </Announcer>
  );
}
