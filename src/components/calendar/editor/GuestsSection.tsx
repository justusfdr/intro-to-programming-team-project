"use client";

// GUESTS (spec 24), right under WHEN (so it is seen without scrolling; the owner did not find it
// further down), in the look of the other sections. Outlook does the inviting: the
// guests are saved with the editor's Save button (or "Add event"), and Outlook sends each one an
// invitation when the event reaches it.
// - Our own event while Outlook is connected: the guests as small chips (the address, an x to remove
//   it) and a field "Add a guest's e-mail" (Enter or a comma adds; an address that is not one shows the
//   message and adds nothing), then one quiet line about the invitations.
// - Not connected: "Connect Outlook to invite guests", a link to the Outlook card in Settings, no field
//   (guests already saved still show, without the x).
// - An Outlook event: read-only, the organizer first ("Organizer"), then the others (R11).
// - An event that cannot have guests (a demo event, an event of a series): the section stays, with one
//   quiet line that says why, so nobody looks for a field that is not there.
import Link from "next/link";
import { useState } from "react";
import { Users, X } from "lucide-react";
import { cleanGuest, MAX_GUESTS, splitTyped } from "@/lib/events/guests";
import { MESSAGES } from "@/lib/messages";
import { Eyebrow, inputClass } from "../fields";

type Props =
  | { mode: "edit"; guests: readonly string[]; onChange: (guests: string[]) => void }
  | { mode: "connect"; guests: readonly string[] }
  | { mode: "outlook"; guests: readonly string[]; organizer: string | null }
  | { mode: "unavailable"; reason: string };

const CHIP = "inline-flex h-7 max-w-full items-center gap-1 rounded-full border border-line-subtle bg-raised pl-2.5 text-xs text-ink";

/** One guest as a chip; with an x when it can be removed. */
function GuestChip({ address, onRemove, note }: { address: string; onRemove?: () => void; note?: string }) {
  return (
    <li className={`${CHIP} ${onRemove ? "pr-1" : "pr-2.5"}`}>
      <span className="min-w-0 truncate">{address}</span>
      {note && <span className="shrink-0 text-ink-3">· {note}</span>}
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${address}`}
          onClick={onRemove}
          className="grid size-5 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-line-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
        >
          <X className="size-3" strokeWidth={2} />
        </button>
      )}
    </li>
  );
}

export function GuestsSection(props: Props) {
  if (props.mode === "unavailable") {
    return (
      <section className="flex flex-col gap-1.5">
        <Eyebrow>Guests</Eyebrow>
        <p className="flex items-start gap-2 text-sm text-ink-3">
          <Users aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.8} />
          <span>{props.reason}</span>
        </p>
      </section>
    );
  }
  if (props.mode === "outlook") {
    if (!props.organizer && props.guests.length === 0) return null;
    return (
      <section className="flex flex-col gap-1.5">
        <Eyebrow>Guests</Eyebrow>
        <ul aria-label="Guests" className="flex flex-wrap gap-1.5">
          {props.organizer && <GuestChip address={props.organizer} note="Organizer" />}
          {props.guests.map((address) => (
            <GuestChip key={address} address={address} />
          ))}
        </ul>
      </section>
    );
  }
  if (props.mode === "connect") {
    return (
      <section className="flex flex-col gap-1.5">
        <Eyebrow>Guests</Eyebrow>
        {props.guests.length > 0 && (
          <ul aria-label="Guests" className="flex flex-wrap gap-1.5">
            {props.guests.map((address) => (
              <GuestChip key={address} address={address} />
            ))}
          </ul>
        )}
        <Link href="/settings#outlook" className="flex w-fit items-center gap-2 text-sm text-ink-2 underline-offset-2 hover:text-ink hover:underline">
          <Users aria-hidden className="size-4 shrink-0 text-ink-3" strokeWidth={1.8} />
          {MESSAGES.guestsNeedOutlook}
        </Link>
      </section>
    );
  }
  return <EditableGuests guests={props.guests} onChange={props.onChange} />;
}

function EditableGuests({ guests, onChange }: { guests: readonly string[]; onChange: (guests: string[]) => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  /** Adds the typed addresses; the first that is not one stops it with the message (nothing more added). */
  function add(parts: string[]): boolean {
    const next = [...guests];
    for (const part of parts) {
      const address = cleanGuest(part);
      if (!address) {
        setError(MESSAGES.guestInvalid);
        return false;
      }
      if (next.includes(address)) continue;
      if (next.length >= MAX_GUESTS) {
        setError(MESSAGES.tooManyGuests);
        return false;
      }
      next.push(address);
    }
    setError("");
    if (next.length !== guests.length) onChange(next);
    return true;
  }

  return (
    <section className="flex flex-col gap-1.5">
      <Eyebrow>Guests</Eyebrow>
      {guests.length > 0 && (
        <ul aria-label="Guests" className="flex flex-wrap gap-1.5">
          {guests.map((address) => (
            <GuestChip key={address} address={address} onRemove={() => onChange(guests.filter((g) => g !== address))} />
          ))}
        </ul>
      )}
      <div className="relative">
        <Users aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" strokeWidth={1.8} />
        <input
          type="text"
          inputMode="email"
          aria-label="Add a guest's e-mail"
          placeholder="Add a guest's e-mail"
          autoComplete="off"
          maxLength={254 * 4}
          value={text}
          aria-invalid={error !== "" || undefined}
          onChange={(e) => {
            // A comma (or a pasted list) adds what comes before it.
            const { parts, rest } = splitTyped(e.target.value);
            if (parts.length > 0) {
              if (add(parts)) setText(rest);
              else setText(e.target.value.replace(/[,;]\s*$/, ""));
              return;
            }
            setText(e.target.value);
            if (error) setError("");
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            e.preventDefault();
            if (text.trim() !== "" && add([text])) setText("");
          }}
          onBlur={() => {
            // Leaving the field keeps what was typed as a guest, so Save does not drop it.
            if (text.trim() !== "" && add([text])) setText("");
          }}
          className={`${inputClass} pl-9`}
        />
      </div>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : (
        <p className="text-xs text-ink-3">Outlook sends each guest an invitation when you save.</p>
      )}
    </section>
  );
}
