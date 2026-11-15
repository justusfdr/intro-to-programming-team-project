// The row "Your profile" at the top of Settings (spec 31), where the Profile card was (spec 28): the
// photo or initials and the shown name, to the profile page. On phones it is the way to the profile,
// since the tab bar has no place for it.
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import type { OwnProfile } from "@/lib/profiles/types";

export function ProfileRow({ profile }: { profile: OwnProfile }) {
  return (
    <Card className="p-0">
      <Link
        href="/profile"
        className="flex items-center gap-3 rounded-[inherit] px-5 py-4 transition-colors hover:bg-raised/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 md:px-6"
      >
        <Avatar name={profile.name} photoUrl={profile.photoUrl} size={32} />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold tracking-snug text-ink">Your profile</span>
          <span className="block truncate text-sm text-ink-2">{profile.name}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-ink-3" strokeWidth={1.8} aria-hidden="true" />
      </Link>
    </Card>
  );
}
