import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Announcer } from "@/components/calendar/Announcer";
import { CalendarView } from "@/components/calendar/CalendarView";
import { GoalsPanel } from "@/components/goals/GoalsPanel";
import { AppShell } from "@/components/shell/AppShell";
import { PanelState } from "@/components/shell/PanelState";
import { pageDeps } from "@/lib/server/deps";
import { loadWeek } from "@/lib/server/events/week";
import { loadGoals } from "@/lib/server/goals/load";
import { localDateTimeOf } from "@/lib/time/zoned";

export const metadata: Metadata = { title: "Calendar" };

const HOUR = 60 * 60 * 1000;

// The calendar (spec 02). The page reads the signed-in user's week on the server through withUser;
// after an action the editor calls router.refresh(), which runs this page again with fresh data.
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ week?: string | string[] }> }) {
  const deps = await pageDeps();
  // The proxy already sends signed-out visitors away; the page checks again (R3).
  const userId = await deps.auth.currentUserId();
  if (!userId) redirect("/sign-in");

  const { week: requested } = await searchParams;
  const week = await loadWeek(deps, userId, typeof requested === "string" ? requested : undefined);
  const goals = await loadGoals(deps, userId);

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
        <AppShell current="/" panels={<GoalsPanel goals={goals} today={nowLocal.slice(0, 10)} />}>
          <CalendarView
            week={week}
            nowLocal={nowLocal}
            suggestion={suggestion}
            goals={goals.map(({ id, title, colorIndex }) => ({ id, title, colorIndex }))}
          />
        </AppShell>
      </PanelState>
    </Announcer>
  );
}
