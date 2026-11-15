"use client";

// The People page (spec 28): invite someone by e-mail address, answer the invitations to you, see the
// invitations you sent, and your contacts. In the look of the settings cards. The server decides
// everything; this sends the input and shows the answer. The answer to an invitation is always the
// same sentence, whatever happened to the address (R44).
// Spec 32: the demo contacts follow the real ones, each with a "Demo" tag and the sharing controls
// disabled; one quiet button adds them, one removes all three.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Inbox, Mail, Send, UserPlus, Users } from "lucide-react";
import { FormMessage } from "@/components/account/FormMessage";
import { useAnnounce } from "@/components/calendar/Announcer";
import { SettingsCardHeader, INPUT_CLASS } from "@/components/settings/fields";
import { Avatar } from "@/components/ui/Avatar";
import { DemoTag } from "@/components/ui/DemoTag";
import { Button } from "@/components/ui/Button";
import { Card, PageHeader } from "@/components/ui/Card";
import { postJson } from "@/lib/client/post-json";
import type { DemoContact } from "@/lib/demo/people";
import type { AvatarLook, PeopleData, PersonCard } from "@/lib/profiles/types";
import { NOTHING_SHARED, type ContactShares } from "@/lib/shares/types";
import { ShareRow } from "./ShareRow";
import { fmtDayMonth } from "@/lib/time/display";
import { localDateOf } from "@/lib/time/zoned";
import type { LucideIcon } from "lucide-react";

/** Sent with an accept: what the other person will see (R45). */
export const ACCEPT_NOTE = "They will see your name, photo and e-mail address.";

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

/** One person in a list. `href`: their profile page (spec 31), for contacts. `look`: a demo contact (spec 32). */
function Person({
  person,
  href,
  look,
  children,
  below,
}: {
  person: Pick<PersonCard, "name" | "email" | "photoUrl">;
  href?: string;
  look?: AvatarLook;
  children?: ReactNode;
  below?: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <Avatar name={person.name} photoUrl={person.photoUrl} look={look} size={32} />
      <div className="min-w-0 flex-1">
        <p className={look ? "flex min-w-0 items-center gap-2 text-sm font-medium text-ink" : "truncate text-sm font-medium text-ink"}>
          {href ? (
            <Link href={href} className={`${look ? "truncate " : ""}hover:underline hover:underline-offset-2 focus-visible:underline`}>
              {person.name}
            </Link>
          ) : (
            person.name
          )}
          {look && <DemoTag />}
        </p>
        <p className="truncate text-xs text-ink-3">{person.email}</p>
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
      {below}
    </li>
  );
}

/** What the demo contacts are, next to the button that adds them. */
export const DEMO_CONTACTS_NOTE = "Three made-up people to try sharing with. They are not accounts and see nothing of yours.";

const NO_DEMO = { on: false, contacts: [] as DemoContact[] };

export function PeopleView({
  data,
  timeZone,
  shares = [],
  demo = NO_DEMO,
}: {
  data: PeopleData;
  timeZone: string;
  shares?: ContactShares[];
  /** Spec 32: whether the demo contacts are on, and then the three of them. */
  demo?: { on: boolean; contacts: DemoContact[] };
}) {
  const router = useRouter();
  const announce = useAnnounce();
  const inputId = useId();
  const hintId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentNote, setSentNote] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [removing, setRemoving] = useState<string | null>(null);

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
                  <Person key={person.id} person={person}>
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
                  </Person>
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
                <li key={sent.id} className="flex flex-wrap items-center gap-3 py-3">
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

        <Section icon={Users} title="Your contacts">
          {data.contacts.length === 0 && demo.contacts.length === 0 ? (
            <Quiet>No contacts yet.</Quiet>
          ) : (
            <ul className="divide-y divide-line-subtle">
              {data.contacts.map((person) =>
                removing === person.id ? (
                  <Person key={person.id} person={person}>
                    <span className="text-xs text-ink-2">Remove? You will no longer see each other.</span>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busy}
                      autoFocus
                      aria-label={`Remove ${person.name} from your contacts`}
                      onClick={async () => {
                        if (await run(`/api/contacts/${person.id}/remove`, {})) setRemoving(null);
                      }}
                    >
                      Remove
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => setRemoving(null)}>
                      Cancel
                    </Button>
                  </Person>
                ) : (
                  <Person
                    key={person.id}
                    person={person}
                    href={`/people/${person.userId}`}
                    below={
                      <ShareRow
                        contactId={person.id}
                        userId={person.userId}
                        name={person.name}
                        out={shares.find((s) => s.contactId === person.id)?.out ?? NOTHING_SHARED}
                        shared={shares.find((s) => s.contactId === person.id)?.in ?? NOTHING_SHARED}
                      />
                    }
                  >
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      aria-label={`Remove ${person.name}`}
                      onClick={() => setRemoving(person.id)}
                    >
                      Remove
                    </Button>
                  </Person>
                ),
              )}
              {demo.contacts.map((person) => (
                <Person
                  key={person.userId}
                  person={{ name: person.name, email: person.bio, photoUrl: null }}
                  look={person.look}
                  href={`/people/${person.userId}`}
                  below={<ShareRow contactId={person.userId} userId={person.userId} name={person.name} out={NOTHING_SHARED} shared={person.shared} demo />}
                />
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-col gap-2 border-t border-line-subtle pt-4 sm:flex-row sm:items-center">
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
        </Section>
      </div>
    </div>
  );
}
