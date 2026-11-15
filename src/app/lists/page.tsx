import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Announcer } from "@/components/calendar/Announcer";
import { LiveProvider } from "@/components/live/Live";
import { ListsView } from "@/components/lists/ListsView";
import { AppShell } from "@/components/shell/AppShell";
import { pageDeps } from "@/lib/server/deps";
import { loadListsPage } from "@/lib/server/pages/load";

export const metadata: Metadata = { title: "Lists" };

// The lists overview (spec 30): the user's own lists and those shared with them. Reads only; every
// change goes through an action.
export default async function ListsPage() {
  const deps = await pageDeps();
  // The proxy already sends signed-out visitors away; the page checks again (R3).
  const userId = await deps.auth.currentUserId();
  if (!userId) redirect("/sign-in");

  const { display, lists } = await loadListsPage(deps, userId);

  return (
    <Announcer>
      <AppShell current="/lists" display={display}>
        <LiveProvider>
          <ListsView lists={lists} />
        </LiveProvider>
      </AppShell>
    </Announcer>
  );
}
