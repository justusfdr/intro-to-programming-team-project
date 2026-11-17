import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Announcer } from "@/components/calendar/Announcer";
import { GoalsPage } from "@/components/goals/GoalsPage";
import { LiveProvider } from "@/components/live/Live";
import { AppShell } from "@/components/shell/AppShell";
import { pageDeps } from "@/lib/server/deps";
import { loadGoalsPageWithPlaces } from "@/lib/server/pages/load";

export const metadata: Metadata = { title: "Goals" };

// The goals with their progress and tasks (spec 39), a page of its own like the coach; before, a
// column beside the calendar. The page reads everything in one transaction (src/lib/server/pages/load.ts);
// every change goes through the goal and task routes. After an action the screen shows the answer at
// once and router.refresh() runs this page again in the background (components/live/Live.tsx).
export default async function GoalsRoute() {
  const deps = await pageDeps();
  // The proxy already sends signed-out visitors away; the page checks again (R3).
  const userId = await deps.auth.currentUserId();
  if (!userId) redirect("/sign-in");

  // Spec 42: the saved places too, offered as a goal's place in the questions and the goal editor.
  const { display, goals, tasks, today, places } = await loadGoalsPageWithPlaces(deps, userId);

  return (
    <Announcer>
      <LiveProvider>
        <AppShell current="/goals" display={display}>
          <GoalsPage goals={goals} tasks={tasks} today={today} places={places} />
        </AppShell>
      </LiveProvider>
    </Announcer>
  );
}
