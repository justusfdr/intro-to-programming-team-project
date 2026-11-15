"use client";

// "Share" for the owner of a list (spec 30, R53): their contacts, each with Add or Remove. Adding is
// immediate (the two already accepted each other as contacts), so the panel says what it does before
// the click: "<name> will see this list and its entries at once."
import Link from "next/link";
import { useId } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { ListPerson, ShareContact } from "@/lib/lists/types";

/** What adding someone means (R53). */
export const seesAtOnce = (name: string) => `${name} will see this list and its entries at once.`;

type Props = {
  id: string;
  contacts: ShareContact[];
  people: ListPerson[];
  busy: boolean;
  onAdd: (contact: ShareContact) => void;
  onRemove: (userId: string, name: string) => void;
};

export function SharePanel({ id, contacts, people, busy, onAdd, onRemove }: Props) {
  const titleId = useId();
  const members = new Set(people.filter((p) => !p.isOwner).map((p) => p.userId));
  return (
    <Card id={id} role="region" aria-labelledby={titleId} className="p-4 md:p-5">
      <h2 id={titleId} className="text-[15px] font-semibold tracking-snug text-ink">
        Share with your contacts
      </h2>
      <p className="mt-1 text-xs text-ink-3">Members can add, tick, rename, move and delete entries. Only you rename or delete the list.</p>
      {contacts.length === 0 ? (
        <p className="mt-3 text-sm text-ink-3">
          You have no contacts yet. Invite someone on the{" "}
          <Link href="/people" className="font-medium text-ink underline underline-offset-2">
            People
          </Link>{" "}
          page first.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-line-subtle">
          {contacts.map((contact) => {
            const member = members.has(contact.userId);
            return (
              <li key={contact.contactId} className="flex flex-wrap items-center gap-3 py-2.5">
                <Avatar name={contact.name} photoUrl={contact.photoUrl} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{contact.name}</p>
                  <p className="truncate text-xs text-ink-3">{member ? "In this list" : seesAtOnce(contact.name)}</p>
                </div>
                {member ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    aria-label={`Remove ${contact.name} from this list`}
                    onClick={() => onRemove(contact.userId, contact.name)}
                  >
                    Remove
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={busy}
                    aria-label={`Add ${contact.name}. ${seesAtOnce(contact.name)}`}
                    onClick={() => onAdd(contact)}
                  >
                    Add
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
