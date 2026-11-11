import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/account/SignOutButton";
import { Announcer } from "@/components/calendar/Announcer";
import { CreateEvent } from "@/components/calendar/CreateEvent";
import { WeekGrid } from "@/components/calendar/WeekGrid";
import { WeekNav } from "@/components/calendar/WeekNav";
import { APP_NAME } from "@/lib/app-name";
import { pageDeps } from "@/lib/server/deps";
import { loadWeek } from "@/lib/server/events/week";
import { dayLabel, localDateTimeOf } from "@/lib/time/zoned";

export const metadata: Metadata = { title: "Week" };

const HOUR = 60 * 60 * 1000;

// The week view (spec 02). The page reads the signed-in user's events on the server through withUser;
// after an action the forms call router.refresh(), which runs this page again with fresh data.
export default async function WeekPage({ searchParams }: { searchParams: Promise<{ week?: string | string[] }> }) {
  const deps = await pageDeps();
  // The proxy already sends signed-out visitors away; the page checks again (R3).
  const userId = await deps.auth.currentUserId();
  if (!userId) redirect("/sign-in");

  const { week: requested } = await searchParams;
  const week = await loadWeek(deps, userId, typeof requested === "string" ? requested : undefined);

  // The new-event form suggests the next full hour, one hour long.
  const nextHour = new Date(Math.ceil(deps.now().getTime() / HOUR) * HOUR);
  const suggestion = {
    title: "",
    start: localDateTimeOf(nextHour, week.timeZone),
    end: localDateTimeOf(new Date(nextHour.getTime() + HOUR), week.timeZone),
    mayOverlap: false,
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-ink-2">{APP_NAME}</p>
          <h1 className="text-2xl font-semibold tracking-heading">
            Week of {dayLabel(week.monday)}
          </h1>
          <p className="text-xs text-ink-2">Times in {week.timeZone}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <WeekNav week={week} />
          <SignOutButton />
        </div>
      </header>
      <div className="mt-6">
        <Announcer>
          <WeekGrid week={week} />
        </Announcer>
      </div>
      <div className="mt-8 max-w-xl">
        <CreateEvent initial={suggestion} />
      </div>
    </main>
  );
}
