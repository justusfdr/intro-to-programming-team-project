"use client";

// The parts of a person's profile page under their card (spec 53, from spec 33):
// - "What you share with <name>": the sharing controls and removing the contact with its confirm step;
// - "<name>'s week": their shared calendar for a week as a read-only list (PersonWeek), or one quiet
//   sentence when they do not share it, and "Show in my calendar" (the same remembered choice the
//   calendar's People button stores, then the calendar opens).
import { useRouter } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { useAnnounce } from "@/components/calendar/Announcer";
import { rememberShown } from "@/components/calendar/useSharedCalendars";
import { FormMessage } from "@/components/account/FormMessage";
import { ShareRow } from "@/components/people/ShareRow";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { postJson } from "@/lib/client/post-json";
import type { PersonRelation, SharingPerson } from "@/lib/shares/types";
import { PersonWeek } from "./PersonWeek";

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  const titleId = useId();
  return (
    <Card role="region" aria-labelledby={titleId} className="flex max-w-3xl flex-col gap-3 p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={titleId} className="text-[15px] font-semibold tracking-snug text-ink">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

/** Removing the contact, with one confirm step. */
function RemoveContact({ contactId, name }: { contactId: string; name: string }) {
  const router = useRouter();
  const announce = useAnnounce();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const answer = await postJson(`/api/contacts/${contactId}/remove`, {});
    setBusy(false);
    if (!answer.ok) {
      setError(answer.message);
      return;
    }
    announce(answer.message);
    router.push("/people");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 border-t border-line-subtle pt-3">
      {error && <FormMessage tone="error" text={error} />}
      {asking ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-2">Remove? You will no longer see each other.</span>
          <Button size="sm" variant="danger" disabled={busy} autoFocus aria-label={`Remove ${name} from your contacts`} onClick={() => void remove()}>
            Remove
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setAsking(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div>
          <Button size="sm" variant="secondary" aria-label={`Remove ${name}`} onClick={() => setAsking(true)}>
            Remove contact
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * "Show in my calendar": the person joins the signed-in user's shown calendars, then the calendar opens.
 * R58 allows three at once: when three are shown already, nobody is added (the People button there says so).
 */
function ShowInMyCalendar({ viewerId, userId }: { viewerId: string; userId: string }) {
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => {
        rememberShown(viewerId, userId);
        router.push(`/?share=${encodeURIComponent(userId)}`);
      }}
    >
      Show in my calendar
    </Button>
  );
}

export function PersonSections({
  person,
  relation,
  timeZone,
  now,
  viewerId,
}: {
  /** The person as the calendar knows them (name, photo, what they share). */
  person: SharingPerson;
  relation: PersonRelation | null;
  /** Their own time zone (from their card): their week is shown in it. */
  timeZone: string;
  /** When the page was read (ISO). */
  now: string;
  /** The signed-in user (the key of the remembered choice of shown calendars). */
  viewerId: string;
}) {
  const level = relation?.shared.calendar ?? "none";
  return (
    <>
      {relation && (
        <Section title={`What you share with ${person.name}`}>
          <ShareRow contactId={relation.contactId} name={person.name} out={relation.out} />
          <RemoveContact contactId={relation.contactId} name={person.name} />
        </Section>
      )}
      <Section title={`${person.name}'s week`} action={level !== "none" ? <ShowInMyCalendar viewerId={viewerId} userId={person.userId} /> : undefined}>
        {level !== "none" ? (
          <PersonWeek person={person} timeZone={timeZone} now={now} />
        ) : (
          <p className="text-sm text-ink-3">{person.name} does not share their calendar with you.</p>
        )}
      </Section>
    </>
  );
}
