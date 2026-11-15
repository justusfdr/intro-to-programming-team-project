import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Announcer } from "@/components/calendar/Announcer";
import { LiveProvider } from "@/components/live/Live";
import { CalendarView } from "@/components/calendar/CalendarView";
import { AppShell } from "@/components/shell/AppShell";
import { Welcome } from "@/components/shell/Welcome";
import { outlookConfigured } from "@/lib/server/config";
import { pageDeps } from "@/lib/server/deps";
import { readAddress } from "@/lib/events/views";
import { loadCalendarPage } from "@/lib/server/pages/load";
import { localDateTimeOf } from "@/lib/time/zoned";

export const metadata: Metadata = { title: "Calendar" };

// The calendar (specs 02 and 14). The address names the view and the day (/?view=day&date=2026-11-18;
// without them the default view from the settings and today). The page reads exactly those days, the
// goals and the tasks on the server in one transaction (src/lib/server/pages/load.ts). After an action
// the screen shows the answer at once and router.refresh() runs this page again in the background.
// The goals are read for their names and colours (event blocks, the editor's goal chips); their
// progress and tasks have a page of their own since spec 39 (src/app/goals/page.tsx).
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[]; date?: string | string[]; week?: string | string[] }>;
}) {
  const deps = await pageDeps();
  // The proxy already sends signed-out visitors away; the page checks again (R3).
  const userId = await deps.auth.currentUserId();
  if (!userId) redirect("/sign-in");

  const address = readAddress(await searchParams);
  const { display, week, goals, showWelcome } = await loadCalendarPage(deps, userId, address.date, address.view);

  const now = deps.now();
  const nowLocal = localDateTimeOf(now, week.timeZone);
  return (
    <Announcer>
      <LiveProvider>
        <AppShell current="/" display={display}>
          <CalendarView
            week={week}
            nowLocal={nowLocal}
            goals={goals.map(({ id, title, look }) => ({ id, title, look }))}
            outlookAvailable={outlookConfigured()}
          />
        </AppShell>
        {showWelcome && <Welcome timeFormat={display.timeFormat} />}
      </LiveProvider>
    </Announcer>
  );
}
