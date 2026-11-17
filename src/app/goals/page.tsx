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
// Spec 47: `?goal=<id>` from a goal widget in the sidebar scrolls to that goal and marks it.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function GoalsRoute({ searchParams }: { searchParams: Promise<{ goal?: string | string[] }> }) {
  const deps = await pageDeps();
  // The proxy already sends signed-out visitors away; the page checks again (R3).
  const userId = await deps.auth.currentUserId();
  if (!userId) redirect("/sign-in");

  // Spec 42: the saved places too, offered as a goal's place in the questions and the goal editor.
  const { display, goals, tasks, today, places } = await loadGoalsPageWithPlaces(deps, userId);
  const { goal } = await searchParams;
  const focusGoalId = typeof goal === "string" && UUID.test(goal) ? goal : undefined;

  return (
    <Announcer>
      <LiveProvider>
        <AppShell current="/goals" display={display}>
          <GoalsPage goals={goals} tasks={tasks} today={today} places={places} focusGoalId={focusGoalId} />
        </AppShell>
      </LiveProvider>
    </Announcer>
  );
}
