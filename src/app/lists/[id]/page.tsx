import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Announcer } from "@/components/calendar/Announcer";
import { LiveProvider } from "@/components/live/Live";
import { ListView } from "@/components/lists/ListView";
import { AppShell } from "@/components/shell/AppShell";
import { pageDeps } from "@/lib/server/deps";
import { loadListPage } from "@/lib/server/pages/load";

export const metadata: Metadata = { title: "List" };

// One shared list (spec 30). A list the user may not use, a missing one and a malformed id all show
// the same "Not found" (R55); a member who was removed or left sees it from their next request on.
export default async function ListPage({ params }: { params: Promise<{ id: string }> }) {
  const deps = await pageDeps();
  // The proxy already sends signed-out visitors away; the page checks again (R3).
  const userId = await deps.auth.currentUserId();
  if (!userId) redirect("/sign-in");

  const { id } = await params;
  const loaded = await loadListPage(deps, userId, id);
  if (!loaded) notFound();

  return (
    <Announcer>
      <AppShell current="/lists" display={loaded.display}>
        <LiveProvider>
          <ListView data={loaded.page} />
        </LiveProvider>
      </AppShell>
    </Announcer>
  );
}
