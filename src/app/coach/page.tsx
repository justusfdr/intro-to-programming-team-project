import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Announcer } from "@/components/calendar/Announcer";
import { CoachView } from "@/components/coach/CoachView";
import { AppShell } from "@/components/shell/AppShell";
import { planGoalText } from "@/lib/chat/plan-goal";
import { pageDeps } from "@/lib/server/deps";
import { loadChatPage } from "@/lib/server/pages/load";

export const metadata: Metadata = { title: "Coach" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The coach, the AI chat (spec 19). The page reads everything in one transaction
// (src/lib/server/pages/load.ts); every change goes through the chat's routes under /api/chat.
// Spec 44: the coach keeps separate chats. /coach opens the latest one, /coach?chat=new a new, empty
// chat, and /coach?chat=<id> that chat (a new one when it is not the user's or no longer exists).
// &message=<id> (from a search) scrolls the chat to that message and marks it for a moment.
// Spec 43: /coach?plan=<goal id> from a goal starts a new chat with the field saying "Plan "<title>" into
// my week." when the id is one of the user's own goals (the goals the page read); nothing is sent until
// the person sends it. Any other value is ignored, and nothing else is read from the address.
export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string | string[]; chat?: string | string[]; message?: string | string[] }>;
}) {
  const deps = await pageDeps();
  // The proxy already sends signed-out visitors away; the page checks again (R3).
  const userId = await deps.auth.currentUserId();
  if (!userId) redirect("/sign-in");

  const { plan, chat, message } = await searchParams;
  const asked = typeof chat === "string" ? chat : null;
  let data = await loadChatPage(deps, userId, asked === null ? "latest" : asked === "new" ? "new" : { id: asked });
  const planText = planGoalText(plan, data.goals);
  // Planning a goal starts its own chat.
  if (planText && data.chatId !== null) data = await loadChatPage(deps, userId, "new");

  return (
    <Announcer>
      <AppShell current="/coach" display={data.display}>
        {/* One instance for all chats: it starts a chat fresh itself when the page names another one. */}
        <CoachView
          data={data}
          focusMessageId={typeof message === "string" && UUID.test(message) ? message : null}
          {...(planText ? { defaultText: planText, focusField: true } : {})}
        />
      </AppShell>
    </Announcer>
  );
}
