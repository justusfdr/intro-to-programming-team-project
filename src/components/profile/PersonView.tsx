// Another person's profile (spec 31), read only: their photo (or initials), shown name, e-mail address,
// bio, LinkedIn link and time zone with the local time there. Only for people the user may see (R43);
// the page shows "Not found" for everyone else. Spec 32: a demo contact's page looks the same, with the
// "Demo" tag and without an e-mail address (they have none).
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { DemoTag } from "@/components/ui/DemoTag";
import type { DemoProfileCard } from "@/lib/demo/people";
import type { ProfileCardData } from "@/lib/profiles/types";
import { LinkedInLink, TimeZoneLine } from "./parts";

export function PersonView({ person, now }: { person: ProfileCardData | DemoProfileCard; now: string }) {
  const demo = "demo" in person;
  const photoUrl = demo ? null : person.photoUrl;
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-6 md:px-8 md:py-8">
      <Link href="/people" className="inline-flex w-fit items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" strokeWidth={1.8} aria-hidden="true" />
        People
      </Link>
      <Card className="flex max-w-3xl flex-col gap-4 p-5 md:p-6">
        <header className="flex min-w-0 items-center gap-4">
          <Avatar
            name={person.name}
            photoUrl={photoUrl}
            look={demo ? person.look : undefined}
            size={64}
            label={photoUrl ? `Photo of ${person.name}` : `Initials of ${person.name}`}
          />
          <div className="min-w-0">
            {demo ? (
              <h1 className="flex min-w-0 items-center gap-2 text-[24px] leading-[30px] font-semibold tracking-heading text-ink">
                <span className="truncate">{person.name}</span>
                <DemoTag />
              </h1>
            ) : (
              <h1 className="truncate text-[24px] leading-[30px] font-semibold tracking-heading text-ink">{person.name}</h1>
            )}
            {demo ? (
              <p className="text-sm text-ink-3">A made-up person to try LockedIn with. Not an account.</p>
            ) : (
              <p className="truncate text-sm text-ink-3">{person.email}</p>
            )}
          </div>
        </header>
        {person.bio ? <p dir="auto" className="break-words text-sm text-ink">{person.bio}</p> : <p className="text-sm text-ink-3">No bio yet.</p>}
        <TimeZoneLine timeZone={person.timeZone} now={now} />
        <LinkedInLink url={person.linkedinUrl} />
      </Card>
    </div>
  );
}
