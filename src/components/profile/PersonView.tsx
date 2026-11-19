// Another person's profile (spec 53, from specs 31 and 33), read only: their photo (or initials), shown
// name, e-mail address, bio, LinkedIn link and time zone with the local time there. Only for people the
// user may see (R43); the page shows "Not found" for everyone else. With `sections`, under the card
// "What you share with <name>" and "<name>'s week" (PersonSections).
// Name, address and bio are rendered as text; the LinkedIn link only after isLinkedInUrl (LinkedInLink).
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import type { ProfileCardData } from "@/lib/profiles/types";
import { NOTHING_SHARED, type PersonRelation, type SharingPerson } from "@/lib/shares/types";
import { LinkedInLink, TimeZoneLine } from "./parts";
import { PersonSections } from "./PersonSections";

export function PersonView({
  person,
  now,
  sections = false,
  relation = null,
  viewerId = "",
}: {
  person: ProfileCardData;
  now: string;
  /** The signed-in user (for "Show in my calendar"). */
  viewerId?: string;
  /** Show the sections under the card. */
  sections?: boolean;
  relation?: PersonRelation | null;
}) {
  const shared = relation?.shared ?? NOTHING_SHARED;
  const asSharing: SharingPerson = {
    userId: person.userId,
    name: person.name,
    photoUrl: person.photoUrl,
    calendar: shared.calendar,
    focus: shared.focus,
  };
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-6 md:px-8 md:py-8">
      <Link href="/people" className="inline-flex w-fit items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" strokeWidth={1.8} aria-hidden="true" />
        People
      </Link>
      <Card className="flex max-w-3xl flex-col gap-4 p-5 md:p-6">
        <header className="flex min-w-0 items-center gap-4">
          <Avatar name={person.name} photoUrl={person.photoUrl} size={64} label={person.photoUrl ? `Photo of ${person.name}` : `Initials of ${person.name}`} />
          <div className="min-w-0">
            <h1 className="truncate text-[24px] leading-[30px] font-semibold tracking-heading text-ink">{person.name}</h1>
            <p className="truncate text-sm text-ink-3">{person.email}</p>
          </div>
        </header>
        {person.bio ? <p dir="auto" className="break-words text-sm text-ink">{person.bio}</p> : <p className="text-sm text-ink-3">No bio yet.</p>}
        <TimeZoneLine timeZone={person.timeZone} now={now} settingsLink={false} />
        <LinkedInLink url={person.linkedinUrl} />
      </Card>
      {sections && <PersonSections person={asSharing} relation={relation} timeZone={person.timeZone} now={now} viewerId={viewerId} />}
    </div>
  );
}
