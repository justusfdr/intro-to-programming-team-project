import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Announcer } from "@/components/calendar/Announcer";
import { CoachView } from "@/components/coach/CoachView";
import { AppShell } from "@/components/shell/AppShell";
import { pageDeps } from "@/lib/server/deps";
import { loadChatPage } from "@/lib/server/pages/load";

export const metadata: Metadata = { title: "Coach" };

// The coach, the AI chat (spec 19). The page reads everything in one transaction
// (src/lib/server/pages/load.ts); every change goes through the chat's routes under /api/chat.
export default async function CoachPage() {
  const deps = await pageDeps();
  // The proxy already sends signed-out visitors away; the page checks again (R3).
  const userId = await deps.auth.currentUserId();
  if (!userId) redirect("/sign-in");

  const data = await loadChatPage(deps, userId);

  return (
    <Announcer>
      <AppShell current="/coach" display={data.display}>
        <CoachView data={data} />
      </AppShell>
    </Announcer>
  );
}
