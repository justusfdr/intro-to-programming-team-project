import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Announcer } from "@/components/calendar/Announcer";
import { LiveProvider } from "@/components/live/Live";
import { CalendarView } from "@/components/calendar/CalendarView";
import { GoalsPanel } from "@/components/goals/GoalsPanel";
import { AppShell } from "@/components/shell/AppShell";
import { PanelState } from "@/components/shell/PanelState";
import { Welcome } from "@/components/shell/Welcome";
import { outlookConfigured } from "@/lib/server/config";
import { pageDeps } from "@/lib/server/deps";
import { readAddress } from "@/lib/events/views";
import { loadCalendarPageWithInvites } from "@/lib/server/pages/load";
import { localDateTimeOf } from "@/lib/time/zoned";

export const metadata: Metadata = { title: "Calendar" };

// The calendar (specs 02 and 14). The address names the view and the day (/?view=day&date=2026-11-18;
// without them the default view from the settings and today). The page reads exactly those days, the
// goals and the tasks on the server in one transaction (src/lib/server/pages/load.ts). After an action
// the screen shows the answer at once and router.refresh() runs this page again in the background.
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[]; date?: string | string[]; week?: string | string[]; share?: string | string[] }>;
}) {
  const deps = await pageDeps();
  // The proxy already sends signed-out visitors away; the page checks again (R3).
  const userId = await deps.auth.currentUserId();
  if (!userId) redirect("/sign-in");

  const params = await searchParams;
  const address = readAddress(params);
  // Spec 36: also the event invitations (the events the user is invited to, the open ones, the badge's
  // number and the people of the user's own events), in the same one transaction.
  const { display, week, goals, tasks, showWelcome, sharing, guestPeople, invites } = await loadCalendarPageWithInvites(deps, userId, address.date, address.view);

  const now = deps.now();
  const nowLocal = localDateTimeOf(now, week.timeZone);
  return (
    <Announcer>
      <LiveProvider>
        <PanelState>
          <AppShell current="/" display={display} pendingInvites={invites.pending} panelsLeft={<GoalsPanel goals={goals} tasks={tasks} today={nowLocal.slice(0, 10)} />}>
            <CalendarView
              week={week}
              nowLocal={nowLocal}
              goals={goals.map(({ id, title, look }) => ({ id, title, look }))}
              outlookAvailable={outlookConfigured()}
              sharing={sharing.filter((p) => p.calendar !== "none")}
              showPerson={typeof params.share === "string" ? params.share : undefined}
              guestPeople={guestPeople}
              invites={invites}
            />
          </AppShell>
          {showWelcome && <Welcome timeFormat={display.timeFormat} />}
        </PanelState>
      </LiveProvider>
    </Announcer>
  );
}
