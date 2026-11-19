import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Announcer } from "@/components/calendar/Announcer";
import { PeopleView } from "@/components/people/PeopleView";
import { AppShell } from "@/components/shell/AppShell";
import { pageDeps } from "@/lib/server/deps";
import { loadPeoplePageWithInvites } from "@/lib/server/pages/load";

export const metadata: Metadata = { title: "People" };

// The People page (spec 53, from specs 28 and 33): contacts and invitations, the contacts as cards. Reads
// only; every change goes through an action. Spec 54 (changed 19 Nov 2026): also the event invitations
// still to look at, answered here as on the calendar, and both numbers for the one badge on "People".
export default async function PeoplePage() {
  const deps = await pageDeps();
  // The proxy already sends signed-out visitors away; the page checks again (R3).
  const userId = await deps.auth.currentUserId();
  if (!userId) redirect("/sign-in");

  const { display, timeZone, people, shares, facts, now, eventInvites } = await loadPeoplePageWithInvites(deps, userId);

  return (
    <Announcer>
      <AppShell
        current="/people"
        display={display}
        invitations={people.received.length}
        pendingInvites={eventInvites.pending}
        me={{ name: people.me.name, photoUrl: people.me.photoUrl }}
      >
        <PeopleView data={people} timeZone={timeZone} shares={shares} facts={facts} now={now} eventInvites={eventInvites.open} />
      </AppShell>
    </Announcer>
  );
}
