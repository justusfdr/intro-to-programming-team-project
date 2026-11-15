"use client";

// The People page (spec 28): invite someone by e-mail address, answer the invitations to you, see the
// invitations you sent, and your contacts. The server decides everything; this sends the input and shows
// the answer. The answer to an invitation is always the same sentence, whatever happened to the address
// (R44).
// Spec 32: the demo contacts follow the real ones, each with a "Demo" tag; one quiet button adds them,
// one removes all three.
// Spec 33: the contacts are cards in a grid (1 column on phones, 2 from 640 px, 3 from 1024 px), each one
// link to the person's profile page: avatar, shown name, the first line of the bio, their local time with
// the city, and small marks of what they share with the user. No e-mail address on the cards; the
// sharing controls and "Remove" live on the profile page now. Invitations stay above the grid as compact
// rows; an inviter is a PersonChip with a hover card (their address is shown there, as R45 allows).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Clock, Inbox, Mail, Send, UserPlus, Users } from "lucide-react";
import { FormMessage } from "@/components/account/FormMessage";
import { useAnnounce } from "@/components/calendar/Announcer";
import { useMinuteClock } from "@/components/profile/parts";
import { SettingsCardHeader, INPUT_CLASS } from "@/components/settings/fields";
import { useDisplay } from "@/components/shell/DisplayProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card, PageHeader } from "@/components/ui/Card";
import { DemoTag } from "@/components/ui/DemoTag";
import { postJson } from "@/lib/client/post-json";
import type { DemoContact } from "@/lib/demo/people";
import { bioLine, localTimeLabel } from "@/lib/people/present";
import type { AvatarLook, PeopleData, PersonFacts } from "@/lib/profiles/types";
import { NOTHING_SHARED, type ContactShares, type ShareSetting } from "@/lib/shares/types";
import { fmtDayMonth } from "@/lib/time/display";
import { localDateOf } from "@/lib/time/zoned";
import type { LucideIcon } from "lucide-react";
import { PersonChip, profileHref, ShareMarks } from "./PersonChip";

/** Sent with an accept: what the other person will see (R45). */
export const ACCEPT_NOTE = "They will see your name, photo and e-mail address.";

/** What the demo contacts are, next to the button that adds them. */
export const DEMO_CONTACTS_NOTE = "Three made-up people to try sharing with. They are not accounts and see nothing of yours.";

function Section({ icon, title, description, children }: { icon: LucideIcon; title: string; description?: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <Card role="region" aria-labelledby={titleId} className="p-5 md:p-6">
      <SettingsCardHeader icon={icon} title={title} titleId={titleId} description={description} />
      <div className="mt-4">{children}</div>
    </Card>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ink-3">{children}</p>;
}

/** One person on a card of the grid. */
export type CardPerson = {
  userId: string;
  name: string;
  photoUrl: string | null;
  look?: AvatarLook;
  bio: string | null;
  timeZone: string | null;
  shared: ShareSetting;
};

/** A contact's card: the whole card is one link to their profile page. */
export function ContactCard({ person, now }: { person: CardPerson; now: string }) {
  const { timeFormat } = useDisplay();
  const at = useMinuteClock(now);
  const bio = bioLine(person.bio);
  const time = person.timeZone ? localTimeLabel(at, person.timeZone, timeFormat) : null;
  return (
    <Link
      href={profileHref(person.userId)}
      className="flex h-full min-w-0 items-start gap-4 rounded-card border border-line-subtle bg-surface p-4 transition hover:border-line hover:bg-raised/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
    >
      <Avatar name={person.name} photoUrl={person.photoUrl} look={person.look} size={64} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[15px] font-semibold text-ink">{person.name}</span>
          {person.look && <DemoTag />}
        </span>
        <span dir="auto" className={`truncate text-sm ${bio ? "text-ink-2" : "text-ink-3"}`}>
          {bio ?? "No bio yet."}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          {time && (
            <span className="flex items-center gap-1 text-xs text-ink-3">
              <Clock className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
              <span className="tabular">{time}</span>
            </span>
          )}
          <ShareMarks shared={person.shared} />
        </span>
      </span>
    </Link>
  );
}

const NO_DEMO = { on: false, contacts: [] as DemoContact[] };

export function PeopleView({
  data,
  timeZone,
  shares = [],
  demo = NO_DEMO,
  facts = [],
  now,
}: {
  data: PeopleData;
  timeZone: string;
  shares?: ContactShares[];
  /** Spec 32: whether the demo contacts are on, and then the three of them. */
  demo?: { on: boolean; contacts: DemoContact[] };
  /** Spec 33: bio and time zone of contacts and inviters. */
  facts?: PersonFacts[];
  /** When the page was read (ISO). */
  now?: string;
}) {
  const router = useRouter();
  const announce = useAnnounce();
  const inputId = useId();
  const hintId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentNote, setSentNote] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [readAt] = useState(() => now ?? new Date().toISOString());
  const contactsTitleId = useId();

  async function run(path: string, body: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    const answer = await postJson(path, body);
    setBusy(false);
    if (!answer.ok) {
      setError(answer.message);
      return false;
    }
    announce(answer.message);
    router.refresh();
    return true;
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    setSentNote(null);
    setBusy(true);
    setError(null);
    const answer = await postJson("/api/contacts/invite", { email });
    setBusy(false);
    if (!answer.ok) {
      setError(answer.message);
      return;
    }
    setSentNote(answer.message);
    setFormKey((k) => k + 1);
    router.refresh();
  }

  const dateOf = (iso: string) => fmtDayMonth(localDateOf(new Date(iso), timeZone));
  const factsOf = (userId: string) => facts.find((f) => f.userId === userId);

  const cards: CardPerson[] = [
    ...data.contacts.map((contact) => ({
      userId: contact.userId,
      name: contact.name,
      photoUrl: contact.photoUrl,
      bio: factsOf(contact.userId)?.bio ?? null,
      timeZone: factsOf(contact.userId)?.timeZone ?? null,
      shared: shares.find((s) => s.contactId === contact.id)?.in ?? NOTHING_SHARED,
    })),
    ...demo.contacts.map((contact) => ({
      userId: contact.userId,
      name: contact.name,
      photoUrl: null,
      look: contact.look,
      bio: contact.bio,
      timeZone: contact.timeZone,
      shared: contact.shared,
    })),
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-6 md:px-8 md:py-8">
      <PageHeader
        title="People"
        subtitle="Your contacts and invitations. Contacts see each other's name, photo and e-mail address, and only what each of you chooses to share."
      />
      <div className="flex max-w-3xl flex-col gap-4">
        <div aria-live="polite">{error && <FormMessage tone="error" text={error} />}</div>

        <Section icon={UserPlus} title="Invite someone" description="They see your name, photo and e-mail address with the invitation.">
          <form key={formKey} onSubmit={invite} noValidate className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label htmlFor={inputId} className="sr-only">
              E-mail address
            </label>
            <input
              id={inputId}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={254}
              placeholder="E-mail address, e.g. lea@example.com"
              aria-describedby={hintId}
              className={`${INPUT_CLASS} min-w-0 flex-1 text-base md:text-sm`}
            />
            <Button type="submit" variant="primary" disabled={busy} className="shrink-0">
              <Send className="size-4" strokeWidth={1.8} aria-hidden="true" />
              Send invitation
            </Button>
          </form>
          <p id={hintId} role="status" className={sentNote ? "mt-3 rounded-xl bg-raised px-3 py-2 text-sm text-ink" : "sr-only"}>
            {sentNote}
          </p>
        </Section>

        <Section icon={Inbox} title="Invitations for you">
          {data.received.length === 0 ? (
            <Quiet>No one has invited you.</Quiet>
          ) : (
            <>
              <p className="text-xs text-ink-3">Accepting makes you contacts. {ACCEPT_NOTE}</p>
              <ul className="divide-y divide-line-subtle">
                {data.received.map((person) => (
                  <li key={person.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1 text-sm font-medium">
                      <PersonChip
                        person={{
                          userId: person.userId,
                          name: person.name,
                          photoUrl: person.photoUrl,
                          email: person.email,
                          bio: factsOf(person.userId)?.bio ?? null,
                          timeZone: factsOf(person.userId)?.timeZone ?? null,
                        }}
                        size={32}
                        now={readAt}
                      />
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        disabled={busy}
                        aria-label={`Accept the invitation from ${person.name}. ${ACCEPT_NOTE}`}
                        onClick={() => void run(`/api/contacts/invitations/${person.id}/answer`, { accept: true })}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        aria-label={`Decline the invitation from ${person.name}`}
                        onClick={() => void run(`/api/contacts/invitations/${person.id}/answer`, { accept: false })}
                      >
                        Decline
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>

        <Section icon={Mail} title="Invitations you sent">
          {data.sent.length === 0 ? (
            <Quiet>You have no open invitations.</Quiet>
          ) : (
            <ul className="divide-y divide-line-subtle">
              {data.sent.map((sent) => (
                <li key={sent.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{sent.email}</p>
                    <p className="text-xs text-ink-3">Sent {dateOf(sent.sentAt)}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    aria-label={`Withdraw the invitation to ${sent.email}`}
                    onClick={() => void run(`/api/contacts/invitations/${sent.id}/withdraw`, {})}
                  >
                    Withdraw
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <section aria-labelledby={contactsTitleId} className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-raised text-ink">
            <Users className="size-5" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <h2 id={contactsTitleId} className="text-[15px] font-semibold tracking-snug text-ink">
            Your contacts
          </h2>
        </div>
        {cards.length === 0 ? (
          <Quiet>No contacts yet.</Quiet>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((person) => (
              <li key={person.userId} className="min-w-0">
                <ContactCard person={person} now={readAt} />
              </li>
            ))}
          </ul>
        )}
        <div className="flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center">
          {demo.on ? (
            <>
              <p className="min-w-0 flex-1 text-xs text-ink-3">The demo contacts are made up. Removing them changes nothing else.</p>
              <Button size="sm" variant="secondary" disabled={busy} className="shrink-0" onClick={() => void run("/api/demo/contacts", { on: false })}>
                Remove demo contacts
              </Button>
            </>
          ) : (
            <>
              <p className="min-w-0 flex-1 text-xs text-ink-3">{DEMO_CONTACTS_NOTE}</p>
              <Button size="sm" variant="ghost" disabled={busy} className="shrink-0" onClick={() => void run("/api/demo/contacts", { on: true })}>
                Add demo contacts
              </Button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
