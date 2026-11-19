"use client";

// PEOPLE IN LOCKEDIN (spec 54, from spec 36; R59), above the guests by e-mail: the user's contacts, each
// with a box to tick, and for those already invited their answer as a mark and in words. It waits for the
// editor's Save button like the other fields (R39); Save then calls the invitation action on its own
// (create_event and edit_event take no people). Where R59 forbids inviting (an event of a series, an
// Outlook or demo event, an event that has ended) the section says why and lists who is invited. Without
// contacts, a link to People. Only names and photos here, as text; never an address.
import Link from "next/link";
import { useId } from "react";
import { UserPlus } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { answerWords, MAX_INVITEES, type InviteAnswer, type InviteContact, type InvitePerson } from "@/lib/invites/types";
import { AnswerMark, InviteesList } from "../Invites";
import { Eyebrow } from "../fields";

type Props =
  | {
      mode: "edit";
      contacts: readonly InviteContact[];
      /** The ticked contacts (contact row ids). */
      chosen: readonly string[];
      /** The answers of the people invited now, by user id (a newly ticked one has none yet). */
      answers: ReadonlyMap<string, InviteAnswer>;
      error: string;
      onToggle: (contactId: string) => void;
    }
  | { mode: "unavailable"; reason: string; people: readonly InvitePerson[] }
  | { mode: "no_contacts" };

const TITLE = "People in LockedIn";

/** One contact with its box: ticked when invited (or about to be), with the answer once invited. */
function ContactRow({ contact, on, answer, disabled, onToggle }: { contact: InviteContact; on: boolean; answer: InviteAnswer | undefined; disabled: boolean; onToggle: () => void }) {
  const state = on ? (answer ? answerWords(answer) : "invited when you save") : answer ? "taken off when you save" : null;
  return (
    <li>
      <label className={`flex min-w-0 items-center gap-2 rounded-lg px-1 py-1 text-sm ${disabled ? "opacity-50" : "cursor-pointer hover:bg-raised"}`}>
        <input type="checkbox" checked={on} disabled={disabled} onChange={onToggle} className="size-4 shrink-0 accent-ink" />
        <Avatar name={contact.name} photoUrl={contact.photoUrl} size={24} />
        <span className="min-w-0 flex-1 truncate text-ink">{contact.name}</span>
        {state && <span className="shrink-0 text-xs text-ink-3">{state}</span>}
        {on && answer && <AnswerMark answer={answer} size={12} />}
      </label>
    </li>
  );
}

export function PeopleSection(props: Props) {
  const hintId = useId();
  if (props.mode === "no_contacts") {
    return (
      <section className="flex flex-col gap-1.5">
        <Eyebrow>{TITLE}</Eyebrow>
        <p className="flex items-start gap-2 text-sm text-ink-3">
          <UserPlus aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.8} />
          <span>
            Invite your contacts to this event.{" "}
            <Link href="/people" className="text-ink underline underline-offset-2 hover:text-ink-2">
              Add contacts on People
            </Link>
          </span>
        </p>
      </section>
    );
  }
  if (props.mode === "unavailable") {
    return (
      <section className="flex flex-col gap-1.5">
        <Eyebrow>{TITLE}</Eyebrow>
        {props.people.length > 0 && <InviteesList people={props.people} />}
        <p className="flex items-start gap-2 text-sm text-ink-3">
          <UserPlus aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.8} />
          <span>{props.reason}.</span>
        </p>
      </section>
    );
  }
  const full = props.chosen.length >= MAX_INVITEES;
  return (
    <section className="flex flex-col gap-1.5">
      <Eyebrow>{TITLE}</Eyebrow>
      <ul aria-label={TITLE} aria-describedby={hintId} className="flex max-h-48 flex-col overflow-y-auto">
        {props.contacts.map((contact) => {
          const on = props.chosen.includes(contact.contactId);
          return (
            <ContactRow
              key={contact.contactId}
              contact={contact}
              on={on}
              answer={props.answers.get(contact.userId)}
              disabled={!on && full}
              onToggle={() => props.onToggle(contact.contactId)}
            />
          );
        })}
      </ul>
      {props.error && (
        <p role="alert" className="text-xs text-danger">
          {props.error}
        </p>
      )}
      <p id={hintId} className="text-xs text-ink-3">
        They see the title, time and place in their calendar and answer there. Up to {MAX_INVITEES} people. Saved with Save; moving the event asks them
        again. Undo after a delete does not invite them again.
      </p>
    </section>
  );
}
