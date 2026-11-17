import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Announcer } from "@/components/calendar/Announcer";
import { CoachView } from "@/components/coach/CoachView";
import { AppShell } from "@/components/shell/AppShell";
import { planGoalText } from "@/lib/chat/plan-goal";
import { pageDeps } from "@/lib/server/deps";
import { loadChatPage } from "@/lib/server/pages/load";

export const metadata: Metadata = { title: "Coach" };

// The coach, the AI chat (spec 19). The page reads everything in one transaction
// (src/lib/server/pages/load.ts); every change goes through the chat's routes under /api/chat.
// Spec 43: /coach?plan=<goal id> from a goal starts the field with "Plan "<title>" into my week." when
// the id is one of the user's own goals (the goals the page read); nothing is sent until the person
// sends it. Any other value is ignored, and nothing else is read from the address.
export default async function CoachPage({ searchParams }: { searchParams: Promise<{ plan?: string | string[] }> }) {
  const deps = await pageDeps();
  // The proxy already sends signed-out visitors away; the page checks again (R3).
  const userId = await deps.auth.currentUserId();
  if (!userId) redirect("/sign-in");

  const data = await loadChatPage(deps, userId);
  const { plan } = await searchParams;
  const planText = planGoalText(plan, data.goals);

  return (
    <Announcer>
      <AppShell current="/coach" display={data.display}>
        <CoachView data={data} {...(planText ? { defaultText: planText, focusField: true } : {})} />
      </AppShell>
    </Announcer>
  );
}
