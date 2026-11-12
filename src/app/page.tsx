import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Announcer } from "@/components/calendar/Announcer";
import { CalendarView } from "@/components/calendar/CalendarView";
import { GoalsPanel } from "@/components/goals/GoalsPanel";
import { AppShell } from "@/components/shell/AppShell";
import { PanelState } from "@/components/shell/PanelState";
import { Welcome } from "@/components/shell/Welcome";
import { outlookConfigured } from "@/lib/server/config";
import { pageDeps } from "@/lib/server/deps";
import { loadCalendarPage } from "@/lib/server/pages/load";
import { localDateTimeOf } from "@/lib/time/zoned";

export const metadata: Metadata = { title: "Calendar" };

const HOUR = 60 * 60 * 1000;

// The calendar (spec 02). The page reads the signed-in user's week, goals and tasks on the server in
// one transaction (src/lib/server/pages/load.ts). After an action the screen shows the answer at once
// and router.refresh() runs this page again in the background with fresh data.
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ week?: string | string[] }> }) {
  const deps = await pageDeps();
  // The proxy already sends signed-out visitors away; the page checks again (R3).
  const userId = await deps.auth.currentUserId();
  if (!userId) redirect("/sign-in");

  const { week: requested } = await searchParams;
  const { display, week, goals, tasks, showWelcome } = await loadCalendarPage(
    deps,
    userId,
    typeof requested === "string" ? requested : undefined,
  );

  const now = deps.now();
  // "New event" suggests the next full hour, one hour long.
  const nextHour = new Date(Math.ceil(now.getTime() / HOUR) * HOUR);
  const suggestion = {
    start: localDateTimeOf(nextHour, week.timeZone),
    end: localDateTimeOf(new Date(nextHour.getTime() + HOUR), week.timeZone),
  };

  const nowLocal = localDateTimeOf(now, week.timeZone);
  return (
    <Announcer>
      <PanelState>
        <AppShell current="/" display={display} panelsLeft={<GoalsPanel goals={goals} tasks={tasks} today={nowLocal.slice(0, 10)} />}>
          <CalendarView
            week={week}
            nowLocal={nowLocal}
            suggestion={suggestion}
            goals={goals.map(({ id, title, look }) => ({ id, title, look }))}
            outlookAvailable={outlookConfigured()}
          />
        </AppShell>
        {showWelcome && <Welcome timeFormat={display.timeFormat} />}
      </PanelState>
    </Announcer>
  );
}
