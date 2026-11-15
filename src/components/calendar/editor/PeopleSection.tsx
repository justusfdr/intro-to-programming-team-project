"use client";

// PEOPLE IN LOCKEDIN (spec 36, R59), above the guests by e-mail: the user's contacts invited to this
// event inside the app, each as a chip with their answer mark, and a list of the other contacts to add.
// It waits for the editor's Save button like the other fields (R39); Save then calls the invitation
// action on its own (create_event and edit_event take no people). Where R59 forbids inviting (an event of a
// series, an Outlook or demo event, an event that has ended) the section says why. Without contacts, a
// link to People. Only names and photos here, never an address.
import Link from "next/link";
import { useId } from "react";
import { UserPlus, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { answerWords, MAX_INVITEES, personAnswerLabel, type InviteAnswer, type InviteContact } from "@/lib/invites/types";
import { AnswerMark } from "../Invites";
import { Eyebrow, inputClass } from "../fields";

/** One chosen person: the contact, and their answer when they were invited already (a new one has none yet). */
export type ChosenPerson = InviteContact & { answer: InviteAnswer | null };

type Props =
  | { mode: "edit"; chosen: readonly ChosenPerson[]; available: readonly InviteContact[]; error: string; onAdd: (contactId: string) => void; onRemove: (contactId: string) => void }
  | { mode: "unavailable"; reason: string; chosen: readonly ChosenPerson[] }
  | { mode: "no_contacts" };

const CHIP = "inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border border-line-subtle bg-raised pl-1 text-xs text-ink";

function PersonChipRow({ person, onRemove }: { person: ChosenPerson; onRemove?: () => void }) {
  const label = person.answer ? personAnswerLabel(person.name, person.answer) : `${person.name}: invited when you save`;
  return (
    <li className={`${CHIP} ${onRemove ? "pr-1" : "pr-2.5"}`} aria-label={label}>
      <Avatar name={person.name} photoUrl={person.photoUrl} size={24} />
      <span className="min-w-0 truncate">{person.name}</span>
      {person.answer ? (
        <>
          <AnswerMark answer={person.answer} size={12} />
          <span className="sr-only">{answerWords(person.answer)}</span>
        </>
      ) : (
        <span className="shrink-0 text-ink-3">new</span>
      )}
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${person.name}`}
          onClick={onRemove}
          className="grid size-5 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-line-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
        >
          <X className="size-3" strokeWidth={2} />
        </button>
      )}
    </li>
  );
}

export function PeopleSection(props: Props) {
  const selectId = useId();
  if (props.mode === "no_contacts") {
    return (
      <section className="flex flex-col gap-1.5">
        <Eyebrow>People in LockedIn</Eyebrow>
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
        <Eyebrow>People in LockedIn</Eyebrow>
        {props.chosen.length > 0 && (
          <ul aria-label="People in LockedIn" className="flex flex-wrap gap-1.5">
            {props.chosen.map((person) => (
              <PersonChipRow key={person.contactId} person={person} />
            ))}
          </ul>
        )}
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
      <Eyebrow>People in LockedIn</Eyebrow>
      {props.chosen.length > 0 && (
        <ul aria-label="People in LockedIn" className="flex flex-wrap gap-1.5">
          {props.chosen.map((person) => (
            <PersonChipRow key={person.contactId} person={person} onRemove={() => props.onRemove(person.contactId)} />
          ))}
        </ul>
      )}
      {props.available.length > 0 && !full && (
        <>
          <label htmlFor={selectId} className="sr-only">
            Invite a contact
          </label>
          <select
            id={selectId}
            value=""
            onChange={(e) => {
              if (e.target.value) props.onAdd(e.target.value);
            }}
            className={inputClass}
          >
            <option value="">Invite a contact…</option>
            {props.available.map((contact) => (
              <option key={contact.contactId} value={contact.contactId}>
                {contact.name}
              </option>
            ))}
          </select>
        </>
      )}
      {props.error && (
        <p role="alert" className="text-xs text-danger">
          {props.error}
        </p>
      )}
      <p className="text-xs text-ink-3">
        They see the title, time and place in their calendar and answer there. Saved with Save; moving the event asks them again. Undo after a delete
        does not invite them again.
      </p>
    </section>
  );
}
