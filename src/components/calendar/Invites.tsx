"use client";

// Event invitations on the screen (spec 54, ported from spec 36; R59 to R64):
// - the answer marks: a green tick (accepted), a red X (declined), a grey dash (maybe), an empty ring (no
//   answer yet), each named in words for screen readers ("Emily Lea: accepted");
// - the people of an event as a list, and as a small stack of up to 3 avatars with "+2" on the owner's
//   block (the block's accessible name and its title say who and how they answered; no hover card);
// - "Accept", "Maybe", "Decline" for the invited person, the current answer pressed;
// - the toolbar's "2 invitations" button with the list of invitations still to look at;
// - the small card of an invited event at its block (title, time, place, "Invited by", the other people,
//   the buttons; spec 38: a floating card, no preview column).
// Everything about another person here is a name and a photo, rendered as text; never an e-mail address.
import { useEffect, useState, type ReactNode } from "react";
import { CalendarClock, Check, Mail, MapPin, Minus, Users, X } from "lucide-react";
import { PersonChip } from "@/components/people/PersonChip";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useDisplay } from "@/components/shell/DisplayProvider";
import { getJson } from "@/lib/client/post-json";
import { ANSWER_BUTTONS, answerWords, invitationsText, personAnswerLabel, type GivenAnswer, type InviteAnswer, type InvitedEvent, type InvitePerson } from "@/lib/invites/types";
import type { TimeFormat } from "@/lib/time/display";
import { anchorOf, FloatingPanel, type Anchor } from "./FloatingPanel";
import { allDayWhen, sharedWhen } from "./Shared";

/** One answer as a small round mark. Decorative: the row or the button around it says it in words. */
export function AnswerMark({ answer, size = 14 }: { answer: InviteAnswer; size?: number }) {
  const box = { width: size, height: size };
  const icon = Math.round(size * 0.7);
  if (answer === "accepted") {
    return (
      <span aria-hidden data-answer="accepted" style={box} className="inline-flex shrink-0 items-center justify-center rounded-full bg-success text-white">
        <Check style={{ width: icon, height: icon }} strokeWidth={3} />
      </span>
    );
  }
  if (answer === "declined") {
    return (
      <span aria-hidden data-answer="declined" style={box} className="inline-flex shrink-0 items-center justify-center rounded-full bg-danger text-white">
        <X style={{ width: icon, height: icon }} strokeWidth={3} />
      </span>
    );
  }
  if (answer === "tentative") {
    return (
      <span aria-hidden data-answer="tentative" style={box} className="inline-flex shrink-0 items-center justify-center rounded-full bg-ink-3 text-white">
        <Minus style={{ width: icon, height: icon }} strokeWidth={3} />
      </span>
    );
  }
  return <span aria-hidden data-answer="pending" style={box} className="inline-block shrink-0 rounded-full border-2 border-ink-3/60 bg-surface" />;
}

/** The people of an event, each with their mark (avatar and name as text; no links: not all are contacts). */
export function InviteesList({ people, label = "People in LockedIn" }: { people: readonly InvitePerson[]; label?: string }) {
  return (
    <ul aria-label={label} className="flex flex-col gap-1.5">
      {people.map((person) => (
        <li key={person.userId} aria-label={personAnswerLabel(person.name, person.answer)} className="flex min-w-0 items-center gap-2 text-sm">
          <Avatar name={person.name} photoUrl={person.photoUrl} size={24} />
          <span className="min-w-0 truncate text-ink">{person.name}</span>
          <span aria-hidden className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-ink-3">
            <span>{answerWords(person.answer)}</span>
            <AnswerMark answer={person.answer} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Up to 3 avatars, overlapping, then "+2" when there are more. Decorative (the block's name says who). */
export function AvatarStack({ people }: { people: readonly InvitePerson[] }) {
  const shown = people.slice(0, 3);
  const more = people.length - shown.length;
  return (
    <span aria-hidden data-avatar-stack className="flex items-center">
      {shown.map((person, i) => (
        <span key={person.userId} className={`rounded-full ring-1 ring-surface ${i > 0 ? "-ml-1" : ""}`}>
          <Avatar name={person.name} photoUrl={person.photoUrl} size={16} />
        </span>
      ))}
      {more > 0 && <span className="ml-0.5 text-[10px] font-medium tabular opacity-80">+{more}</span>}
    </span>
  );
}

/** "Accept", "Maybe", "Decline", the current answer pressed. */
export function AnswerButtons({ answer, busy, onAnswer }: { answer: InviteAnswer; busy: boolean; onAnswer: (answer: GivenAnswer) => void }) {
  return (
    <div role="group" aria-label="Your answer" className="flex flex-wrap gap-2">
      {ANSWER_BUTTONS.map((button) => {
        const on = answer === button.answer;
        return (
          <Button key={button.answer} size="sm" variant={on ? "primary" : "secondary"} aria-pressed={on} disabled={busy} onClick={() => onAnswer(button.answer)}>
            <AnswerMark answer={button.answer} size={12} />
            {button.label}
          </Button>
        );
      })}
    </div>
  );
}

/** "Friday, November 20, 11am – 12pm" of an invited event, on the viewer's clock. */
export function invitedWhen(event: InvitedEvent, timeZone: string, format: TimeFormat): string {
  return event.allDay ? allDayWhen(event.firstDay, event.lastDay) : sharedWhen(event.startAt, event.endAt, timeZone, format);
}

/** A part of the card with its small heading. */
function Part({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
        <span aria-hidden className="text-ink-3">
          {icon}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/** The other people of an invitation, asked once when the card opens. Null while loading. */
export function useInvitePeople(inviteId: string): InvitePerson[] | null {
  const [answer, setAnswer] = useState<{ id: string; people: InvitePerson[] } | null>(null);
  useEffect(() => {
    let current = true;
    void getJson(`/api/invites/${encodeURIComponent(inviteId)}/people`).then((result) => {
      const list = (result.data as { people?: InvitePerson[] } | undefined)?.people;
      if (current) setAnswer({ id: inviteId, people: result.ok && Array.isArray(list) ? list : [] });
    });
    return () => {
      current = false;
    };
  }, [inviteId]);
  return answer?.id === inviteId ? answer.people : null;
}

type InvitedProps = {
  event: InvitedEvent;
  answer: InviteAnswer;
  busy: boolean;
  /** The quiet line after answering ("You accepted."). */
  note: string | null;
  timeZone: string;
  onAnswer: (answer: GivenAnswer) => void;
  /** The other invited people (for the tests and previews); read from the server when left out. */
  people?: InvitePerson[] | null;
};

/** The card's content with the other people already known (also drawn on its own in the tests). */
export function InvitedEventDetails({ event, answer, busy, note, timeZone, onAnswer, people }: InvitedProps & { people: InvitePerson[] | null }) {
  const { timeFormat } = useDisplay();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <h2 className="pr-8 text-[15px] font-semibold leading-snug break-words text-ink">{event.title}</h2>
        <p className="flex items-start gap-2 text-sm text-ink-2">
          <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" strokeWidth={1.8} />
          <span>{invitedWhen(event, timeZone, timeFormat)}</span>
        </p>
      </div>
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-ink-2">
        <Mail aria-hidden className="size-4 shrink-0 text-ink-3" strokeWidth={1.8} />
        <span>Invited by</span>
        {/* The inviter is always the user's contact (R59): a plain link to their page. */}
        <PersonChip person={{ userId: event.inviter.userId, name: event.inviter.name, photoUrl: event.inviter.photoUrl }} size={24} className="text-sm font-medium" />
      </p>
      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-ink">
          Your answer: <span className="font-normal text-ink-2">{answerWords(answer)}</span>
        </p>
        <AnswerButtons answer={answer} busy={busy} onAnswer={onAnswer} />
        {note && (
          <p role="status" className="text-xs text-ink-3">
            {note}
          </p>
        )}
      </section>
      {event.location && (
        <Part icon={<MapPin className="size-4" strokeWidth={1.8} />} title="Place">
          {/* Other people's places are text only, never looked up anywhere. */}
          <p className="text-sm break-words text-ink">{event.location}</p>
        </Part>
      )}
      {people === null ? (
        <p className="text-xs text-ink-3">Loading who else is invited…</p>
      ) : people.length > 0 ? (
        <Part icon={<Users className="size-4" strokeWidth={1.8} />} title="Also invited">
          <InviteesList people={people} label="Also invited" />
        </Part>
      ) : null}
      <p className="text-xs text-ink-3">Read only: only the person who invited you can change this event. It is not sent to your Outlook.</p>
    </div>
  );
}

/** What the card of an event the user is invited to shows (R60), with the other people read once. */
function InvitedEventBody(props: InvitedProps) {
  const people = useInvitePeople(props.event.inviteId);
  return <InvitedEventDetails {...props} people={props.people ?? people} />;
}

/**
 * The small floating card at an invited event's block (spec 38): Escape and a click outside close it, and
 * the focus goes back to the block. Never "Edit"; only the answer can be changed.
 */
export function InvitedEventCard({ anchor, onClose, ...body }: InvitedProps & { anchor: Anchor; onClose: () => void }) {
  return (
    <FloatingPanel anchor={anchor} label={`${body.event.title}, invited by ${body.event.inviter.name}`} width={340} onClose={onClose}>
      <div className="p-4">
        <InvitedEventBody {...body} />
      </div>
    </FloatingPanel>
  );
}

/**
 * One invitation in the toolbar's list (and in the People page's "Event invitations", spec 54, changed
 * 19 Nov 2026): title, time, place as text, who invited, the three answers.
 */
export function OpenInvitation({ event, answer, busy, timeZone, onAnswer }: { event: InvitedEvent; answer: InviteAnswer; busy: boolean; timeZone: string; onAnswer: (a: GivenAnswer) => void }) {
  const { timeFormat } = useDisplay();
  return (
    <li className="flex flex-col gap-2 border-b border-line-subtle py-3 last:border-b-0">
      <div className="flex min-w-0 items-start gap-2">
        <Avatar name={event.inviter.name} photoUrl={event.inviter.photoUrl} size={24} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{event.title}</p>
          <p className="text-xs text-ink-2">{invitedWhen(event, timeZone, timeFormat)}</p>
          {/* Other people's places are text only, never looked up anywhere. */}
          {event.location && <p className="truncate text-xs text-ink-2">{event.location}</p>}
          <p className="truncate text-xs text-ink-3">Invited by {event.inviter.name}</p>
        </div>
        <span className="sr-only">Your answer: {answerWords(answer)}</span>
      </div>
      <AnswerButtons answer={answer} busy={busy} onAnswer={onAnswer} />
    </li>
  );
}

/** The list behind the toolbar's button (also drawn on its own in the tests). */
export function InvitationsList({
  open,
  answerOf,
  busyId,
  timeZone,
  onAnswer,
}: {
  open: readonly InvitedEvent[];
  answerOf: (event: InvitedEvent) => InviteAnswer;
  busyId: string | null;
  timeZone: string;
  onAnswer: (event: InvitedEvent, answer: GivenAnswer) => void;
}) {
  return (
    <div className="flex flex-col p-4">
      <p className="pr-8 text-sm font-semibold text-ink">Invitations</p>
      <p className="text-xs text-ink-3">Events your contacts invited you to. Read only; you can change your answer until the event ends.</p>
      <ul className="mt-1 flex flex-col">
        {open.map((event) => (
          <OpenInvitation key={event.inviteId} event={event} answer={answerOf(event)} busy={busyId === event.inviteId} timeZone={timeZone} onAnswer={(a) => onAnswer(event, a)} />
        ))}
      </ul>
    </div>
  );
}

/**
 * The toolbar's button: "2 invitations" (those not answered yet), shown only while there are invitations
 * to look at (not answered, or declined, of events that have not ended). It opens their list.
 */
export function InvitationsButton(props: {
  open: readonly InvitedEvent[];
  answerOf: (event: InvitedEvent) => InviteAnswer;
  busyId: string | null;
  timeZone: string;
  onAnswer: (event: InvitedEvent, answer: GivenAnswer) => void;
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  if (props.open.length === 0) return null;
  const pending = props.open.filter((e) => props.answerOf(e) === "pending").length;
  const label = pending > 0 ? invitationsText(pending) : "Invitations";
  return (
    <>
      <Button
        variant="secondary"
        size="icon"
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        onClick={(e) => setAnchor(anchor ? null : anchorOf(e.currentTarget))}
        className="relative @3xl:w-auto @3xl:px-4"
      >
        <Mail className="size-4" strokeWidth={2} />
        <span className="hidden @3xl:inline">{label}</span>
        {pending > 0 && (
          <span aria-hidden className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-ink text-[10px] font-semibold text-white tabular @3xl:hidden">
            {pending > 9 ? "9+" : pending}
          </span>
        )}
      </Button>
      {anchor && (
        <FloatingPanel anchor={anchor} label="Invitations" width={340} onClose={() => setAnchor(null)}>
          <InvitationsList {...props} />
        </FloatingPanel>
      )}
    </>
  );
}
