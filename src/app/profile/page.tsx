import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Announcer } from "@/components/calendar/Announcer";
import { ProfileView } from "@/components/profile/ProfileView";
import { AppShell } from "@/components/shell/AppShell";
import { pageDeps } from "@/lib/server/deps";
import { loadProfilePage } from "@/lib/server/pages/load";

export const metadata: Metadata = { title: "Profile" };

// The user's own profile (spec 31): photo, name, bio, LinkedIn link, time zone, and "Sign out". Reads
// only; every change goes through an action.
export default async function ProfilePage() {
  const deps = await pageDeps();
  // The proxy already sends signed-out visitors away; the page checks again (R3).
  const userId = await deps.auth.currentUserId();
  if (!userId) redirect("/sign-in");

  const { display, profile, now } = await loadProfilePage(deps, userId);

  return (
    <Announcer>
      <AppShell current="/profile" display={display} me={{ name: profile.name, photoUrl: profile.photoUrl }}>
        <ProfileView profile={profile} now={now} />
      </AppShell>
    </Announcer>
  );
}
