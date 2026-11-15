import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Announcer } from "@/components/calendar/Announcer";
import { PeopleView } from "@/components/people/PeopleView";
import { AppShell } from "@/components/shell/AppShell";
import { pageDeps } from "@/lib/server/deps";
import { loadPeoplePage } from "@/lib/server/pages/load";

export const metadata: Metadata = { title: "People" };

// The People page (spec 28): contacts and invitations. Reads only; every change goes through an action.
export default async function PeoplePage() {
  const deps = await pageDeps();
  // The proxy already sends signed-out visitors away; the page checks again (R3).
  const userId = await deps.auth.currentUserId();
  if (!userId) redirect("/sign-in");

  const { display, timeZone, people } = await loadPeoplePage(deps, userId);

  return (
    <Announcer>
      <AppShell current="/people" display={display} invitations={people.received.length}>
        <PeopleView data={people} timeZone={timeZone} />
      </AppShell>
    </Announcer>
  );
}
