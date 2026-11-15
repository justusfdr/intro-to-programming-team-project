import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LibraryView } from "@/components/library/LibraryView";
import { AppShell } from "@/components/shell/AppShell";
import { topicOf } from "@/lib/library/library";
import { pageDeps } from "@/lib/server/deps";

export const metadata: Metadata = { title: "Library" };

// The Focus library (spec 29): fixed articles, the same for everyone. The page reads nothing from
// the database; `?topic=` chooses a shelf, anything else shows all of them.
export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ topic?: string | string[] }> }) {
  const deps = await pageDeps();
  // The proxy already sends signed-out visitors away; the page checks again (R3).
  const userId = await deps.auth.currentUserId();
  if (!userId) redirect("/sign-in");

  const { topic } = await searchParams;
  return (
    <AppShell current="/focus">
      <LibraryView topic={topicOf(typeof topic === "string" ? topic : undefined)} />
    </AppShell>
  );
}
