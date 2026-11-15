import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PersonView } from "@/components/profile/PersonView";
import { AppShell } from "@/components/shell/AppShell";
import { pageDeps } from "@/lib/server/deps";
import { loadPersonPage } from "@/lib/server/pages/load";

export const metadata: Metadata = { title: "Profile" };

// Another person's profile (spec 31), read only. Someone the user may not see (R43), a missing user and
// a malformed id all show the same "Not found". The user's own id opens their own profile page.
export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const deps = await pageDeps();
  // The proxy already sends signed-out visitors away; the page checks again (R3).
  const userId = await deps.auth.currentUserId();
  if (!userId) redirect("/sign-in");

  const { id } = await params;
  if (id.toLowerCase() === userId.toLowerCase()) redirect("/profile");
  const loaded = await loadPersonPage(deps, userId, id);
  if (!loaded) notFound();

  return (
    <AppShell current="/people" display={loaded.display} me={loaded.me}>
      <PersonView person={loaded.person} now={loaded.now} />
    </AppShell>
  );
}
