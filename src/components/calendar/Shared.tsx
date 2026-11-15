"use client";

// Other people's shared calendars on the viewer's calendar (spec 29; R48, R50, R51). Everything here is
// read only: a shared block cannot be dragged, resized or opened in the editor. Blocks are muted and
// striped with the person's avatar; "busy" blocks say "Busy" and are not buttons; a "details" block
// opens a small card with title, time, place and whose calendar it is. Placement maths:
// src/lib/shares/place.ts.
import { useId, useState } from "react";
import { Users } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { DemoTag } from "@/components/ui/DemoTag";
import { PersonChip } from "@/components/people/PersonChip";
import { Button } from "@/components/ui/Button";
import { useDisplay } from "@/components/shell/DisplayProvider";
import { blockBox, type GridRange } from "@/lib/events/grid";
import type { InviteMark, SharedAllDayItem, SharedBlock } from "@/lib/shares/place";
import { answerWords, inviteLook } from "@/lib/invites/types";
import { MAX_SHOWN_CALENDARS, levelText, type SharingPerson } from "@/lib/shares/types";
import { fmtDateLong, fmtRange, fmtTime, type TimeFormat } from "@/lib/time/display";
import { localDateTimeOf } from "@/lib/time/zoned";
import { placeOf, whenSentence, type WhenInput } from "@/lib/events/preview";
import { anchorOf, FloatingPanel, type Anchor } from "./FloatingPanel";

/** The muted, striped look of everything that is someone else's. */
export const SHARED_STRIPES = {
  backgroundImage: "repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in srgb, currentColor 8%, transparent) 6px 8px)",
};
const SHARED_CLASS = "border border-dashed border-ink-3/60 bg-surface text-ink-2";

/** What the read-only card shows: one shared event with whose it is. */
export type OpenShared = {
  person: SharingPerson;
  title: string;
  location: string | null;
  /** "Monday, November 16, 9 – 11am" or "Monday, November 16 to Wednesday, November 18 (all day)". */
  when: string;
  /** The same time as data, for the card's short line in the user's format (local to the viewer). */
  time?: WhenInput;
  /** Spec 36: an event the viewer is invited to (the person is who invited them). */
  invite?: InviteMark;
};

/**
 * Spec 36 (R61): how an invited event looks: no answer yet a dashed outline, maybe a dashed outline with
 * a lighter fill, accepted solid. Declined ones are never placed.
 */
export function inviteClass(invite: InviteMark): string {
  const look = inviteLook(invite.answer);
  if (look === "solid") return "border border-line bg-raised text-ink";
  if (look === "tentative") return "border border-dashed border-ink-3/50 bg-surface/60 text-ink-2 opacity-80";
  return "border-2 border-dashed border-ink-3/70 bg-surface text-ink";
}

/** "Group project meeting, Friday, November 20, 11am – 12pm, invited by Lea Sousa, your answer: maybe". */
function inviteLabel(title: string, when: string, person: SharingPerson, invite: InviteMark): string {
  return `${title}, ${when}, invited by ${person.name}, your answer: ${answerWords(invite.answer)}`;
}

/** A shared timed event's start and end on the viewer's clock, for the card's line. */
export function sharedTime(startAt: string, endAt: string, timeZone: string): WhenInput {
  return { allDay: false, startLocal: localDateTimeOf(new Date(startAt), timeZone), endLocal: localDateTimeOf(new Date(endAt), timeZone) };
}

/** "Monday, November 16, 9 – 11am" for a shared timed event, in the viewer's zone. */
export function sharedWhen(startAt: string, endAt: string, timeZone: string, format: TimeFormat): string {
  const start = localDateTimeOf(new Date(startAt), timeZone);
  const end = localDateTimeOf(new Date(endAt), timeZone);
  const sameDay = start.slice(0, 10) === end.slice(0, 10);
  return sameDay
    ? `${fmtDateLong(start.slice(0, 10))}, ${fmtRange(start.slice(11, 16), end.slice(11, 16), format)}`
    : `${fmtDateLong(start.slice(0, 10))}, ${fmtTime(start.slice(11, 16), format)} to ${fmtDateLong(end.slice(0, 10))}, ${fmtTime(end.slice(11, 16), format)}`;
}

export function allDayWhen(firstDay: string, lastDay: string): string {
  return firstDay === lastDay ? `${fmtDateLong(firstDay)}, all day` : `${fmtDateLong(firstDay)} to ${fmtDateLong(lastDay)}, all day`;
}

/** "Ana's calendar". */
export const whose = (person: SharingPerson) => `${person.name}'s calendar`;

/** The toolbar's "People" button: the contacts who share their calendar, at most three shown at once. */
export function SharedPeopleButton({
  people,
  chosen,
  onToggle,
}: {
  people: readonly SharingPerson[];
  chosen: readonly string[];
  onToggle: (userId: string) => void;
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const hintId = useId();
  if (people.length === 0) return null;
  const full = chosen.length >= MAX_SHOWN_CALENDARS;
  return (
    <>
      <Button
        variant="secondary"
        size="icon"
        aria-label={`People's calendars${chosen.length ? `, ${chosen.length} shown` : ""}`}
        title="People's calendars"
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        className="relative @3xl:w-auto @3xl:px-4"
        onClick={(e) => setAnchor(anchor ? null : anchorOf(e.currentTarget))}
      >
        <Users className="size-4" strokeWidth={2} />
        <span className="hidden @3xl:inline">People</span>
        {chosen.length > 0 && (
          <span aria-hidden className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-ink text-[10px] font-semibold text-white tabular">
            {chosen.length}
          </span>
        )}
      </Button>
      {anchor && (
        <FloatingPanel anchor={anchor} label="People's calendars" width={300} onClose={() => setAnchor(null)}>
          <div className="flex flex-col gap-2 p-4">
            <p className="pr-8 text-sm font-semibold text-ink">People&apos;s calendars</p>
            <p id={hintId} className="text-xs text-ink-3">
              Read only. Show up to {MAX_SHOWN_CALENDARS} at once.
            </p>
            <ul className="flex flex-col">
              {people.map((person) => {
                const on = chosen.includes(person.userId);
                return (
                  <li key={person.userId}>
                    <label className={`flex items-center gap-2.5 rounded-lg px-1 py-1.5 text-sm ${!on && full ? "opacity-50" : "cursor-pointer hover:bg-raised"}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!on && full}
                        aria-describedby={hintId}
                        onChange={() => onToggle(person.userId)}
                        className="size-4 shrink-0 accent-ink"
                      />
                      <Avatar name={person.name} photoUrl={person.photoUrl} look={person.demo} size={24} />
                      <span className="min-w-0 flex-1 truncate text-ink">{person.name}</span>
                      {person.demo && <DemoTag />}
                      <span className="shrink-0 text-xs text-ink-3">{levelText(person.calendar)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        </FloatingPanel>
      )}
    </>
  );
}

/** The words a screen reader gets for a shared timed block. */
function blockLabel(block: SharedBlock, timeZone: string, format: TimeFormat): string {
  const when = sharedWhen(block.startAt, block.endAt, timeZone, format);
  const what = block.level === "details" ? block.title || "Busy" : "Busy";
  return `${what}, ${when}, ${whose(block.person)}, read only`;
}

/**
 * A shared timed block in a day column, on the right part of the column (`left` and `width` as
 * fractions of it), so the viewer's own events keep their place on the left.
 */
export function SharedBlockView({
  block,
  range,
  left,
  width,
  timeZone,
  onOpen,
}: {
  block: SharedBlock;
  range: GridRange;
  left: number;
  width: number;
  timeZone: string;
  onOpen: (shared: OpenShared, anchor: Anchor) => void;
}) {
  const { timeFormat } = useDisplay();
  const { top, height } = blockBox(block, range);
  const laneWidth = width / block.lanes;
  const style = {
    ...SHARED_STRIPES,
    top: top + 1,
    height: height - 2,
    left: `calc(${(left + block.lane * laneWidth) * 100}% + 2px)`,
    width: `calc(${laneWidth * 100}% - 4px)`,
  };
  if (block.invite) return <InvitedBlockView block={block} invite={block.invite} style={style} height={height} timeZone={timeZone} onOpen={onOpen} />;
  const text = block.level === "details" ? block.title || "Busy" : "Busy";
  const time = fmtRange(block.startMin, block.endMin, timeFormat);
  const inner = (
    <>
      <span className="flex items-center gap-1">
        <Avatar name={block.person.name} photoUrl={block.person.photoUrl} look={block.person.demo} size={16} />
        <span className="min-w-0 truncate text-[11px] font-medium leading-[14px]">{text}</span>
      </span>
      {height >= 44 && <span className="block truncate text-[10px] leading-[13px] tabular opacity-80">{time}</span>}
    </>
  );
  const className = `absolute z-[1] overflow-hidden rounded-lg px-1 py-0.5 text-left ${SHARED_CLASS}`;
  // The part after midnight repeats a block of the day before: not read out twice.
  if (block.level !== "details" || block.continuesBefore) {
    return (
      <div
        data-shared
        role={block.continuesBefore ? undefined : "note"}
        aria-hidden={block.continuesBefore || undefined}
        aria-label={block.continuesBefore ? undefined : blockLabel(block, timeZone, timeFormat)}
        style={style}
        className={`pointer-events-none ${className}`}
      >
        {inner}
      </div>
    );
  }
  return (
    <button
      type="button"
      data-shared
      aria-label={blockLabel(block, timeZone, timeFormat)}
      style={style}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(
          {
            person: block.person,
            title: block.title || "Busy",
            location: block.location,
            when: sharedWhen(block.startAt, block.endAt, timeZone, timeFormat),
            time: sharedTime(block.startAt, block.endAt, timeZone),
          },
          anchorOf(e.currentTarget),
        );
      }}
      className={`pointer-events-auto cursor-pointer hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 ${className}`}
    >
      {inner}
    </button>
  );
}

/**
 * Spec 36: an event the viewer is invited to, as a read-only block on the right part of the day column:
 * the inviter's small avatar, the title, "Maybe" when that is the answer. A click opens the preview with
 * the answers; it is never dragged, resized or opened in the editor (R63).
 */
function InvitedBlockView({
  block,
  invite,
  style,
  height,
  timeZone,
  onOpen,
}: {
  block: SharedBlock;
  invite: InviteMark;
  style: React.CSSProperties;
  height: number;
  timeZone: string;
  onOpen: (shared: OpenShared, anchor: Anchor) => void;
}) {
  const { timeFormat } = useDisplay();
  const title = block.title || "Invitation";
  const when = sharedWhen(block.startAt, block.endAt, timeZone, timeFormat);
  const { backgroundImage: _stripes, ...plain } = style as React.CSSProperties & { backgroundImage?: string };
  void _stripes;
  return (
    <button
      type="button"
      data-invite={invite.answer}
      aria-label={inviteLabel(title, when, block.person, invite)}
      tabIndex={block.continuesBefore ? -1 : undefined}
      aria-hidden={block.continuesBefore || undefined}
      style={plain}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(
          { person: block.person, title, location: block.location, when, time: sharedTime(block.startAt, block.endAt, timeZone), invite },
          anchorOf(e.currentTarget),
        );
      }}
      className={`pointer-events-auto absolute z-[1] cursor-pointer overflow-hidden rounded-lg px-1 py-0.5 text-left hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 ${inviteClass(invite)}`}
    >
      <span className="flex items-center gap-1">
        <Avatar name={block.person.name} photoUrl={block.person.photoUrl} look={block.person.demo} size={16} />
        <span className="min-w-0 truncate text-[11px] font-medium leading-[14px]">{title}</span>
      </span>
      {height >= 44 && (
        <span className="block truncate text-[10px] leading-[13px] tabular opacity-80">
          {invite.answer === "tentative" ? `Maybe · ${fmtRange(block.startMin, block.endMin, timeFormat)}` : fmtRange(block.startMin, block.endMin, timeFormat)}
        </span>
      )}
      {height < 44 && invite.answer === "tentative" && <span className="sr-only">Maybe</span>}
    </button>
  );
}

/** A shared all-day event as a small striped chip (all-day row and month view). */
export function SharedAllDayChip({ item, onOpen }: { item: SharedAllDayItem; onOpen: (shared: OpenShared, anchor: Anchor) => void }) {
  const text = item.level === "details" ? item.event.title || "Busy" : "Busy";
  const when = allDayWhen(item.event.firstDay, item.event.lastDay);
  const invite = item.event.invite;
  if (invite) {
    return (
      <button
        type="button"
        data-invite={invite.answer}
        aria-label={inviteLabel(text, when, item.person, invite)}
        onClick={(e) => {
          e.stopPropagation();
          onOpen(
            { person: item.person, title: text, location: item.event.location ?? null, when, time: { allDay: true, firstDay: item.event.firstDay, lastDay: item.event.lastDay }, invite },
            anchorOf(e.currentTarget),
          );
        }}
        className={`flex h-[18px] w-full min-w-0 items-center gap-1 rounded-md px-1 text-left text-[11px] leading-[16px] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 ${inviteClass(invite)}`}
      >
        <Avatar name={item.person.name} photoUrl={item.person.photoUrl} look={item.person.demo} size={16} />
        <span className="min-w-0 truncate">{invite.answer === "tentative" ? `Maybe · ${text}` : text}</span>
      </button>
    );
  }
  const label = `${text}, ${when}, ${whose(item.person)}, read only`;
  const className = `flex h-[18px] w-full min-w-0 items-center gap-1 rounded-md px-1 text-left text-[11px] leading-[16px] ${SHARED_CLASS}`;
  const inner = (
    <>
      <Avatar name={item.person.name} photoUrl={item.person.photoUrl} look={item.person.demo} size={16} />
      <span className="min-w-0 truncate">{text}</span>
    </>
  );
  if (item.level !== "details") {
    return (
      <div role="note" aria-label={label} style={SHARED_STRIPES} className={className}>
        {inner}
      </div>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      style={SHARED_STRIPES}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(
          { person: item.person, title: text, location: item.event.location ?? null, when, time: { allDay: true, firstDay: item.event.firstDay, lastDay: item.event.lastDay } },
          anchorOf(e.currentTarget),
        );
      }}
      className={`${className} hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40`}
    >
      {inner}
    </button>
  );
}

/**
 * The read-only card of a shared "details" event at its block: title, time, place as text (never a link
 * or a map), whose calendar. Escape and a click outside close it; the focus goes back to the block.
 */
export function SharedEventCard({ shared, anchor, onClose }: { shared: OpenShared; anchor: Anchor; onClose: () => void }) {
  return (
    <FloatingPanel anchor={anchor} label={`${shared.title}, from ${whose(shared.person)}`} width={300} onClose={onClose}>
      <SharedEventBody shared={shared} />
    </FloatingPanel>
  );
}

/** What the shared event's card shows (also drawn on its own in the tests). */
export function SharedEventBody({ shared }: { shared: OpenShared }) {
  const { timeFormat } = useDisplay();
  const place = placeOf(shared.location);
  return (
    <div className="flex flex-col gap-2 p-4" style={SHARED_STRIPES}>
      <p className="pr-8 text-[15px] font-semibold text-ink break-words">{shared.title}</p>
      <p className="text-sm text-ink-2">{shared.time ? whenSentence(shared.time, timeFormat) : shared.when}</p>
      {place.kind !== "none" && <p className="text-sm break-words text-ink-2">{place.text}</p>}
      <p className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-ink-3">
        <span>From</span>
        {/* Spec 33: the person's name is a chip to their profile (only a link here: no card in a card). */}
        <PersonChip person={{ userId: shared.person.userId, name: shared.person.name, photoUrl: shared.person.photoUrl, look: shared.person.demo }} className="text-xs font-medium" />
        <span>&apos;s calendar. Read only.</span>
      </p>
    </div>
  );
}

/** One shared entry of a month cell: an all-day event, or the start of a timed one. */
export type SharedMonthEntry = { key: string; allDay: SharedAllDayItem } | { key: string; block: SharedBlock };

/** A month cell's shared entry: "9am Busy" with the avatar, striped; a "details" one opens the card. */
export function SharedMonthRow({ entry, timeZone, onOpen }: { entry: SharedMonthEntry; timeZone: string; onOpen: (shared: OpenShared, anchor: Anchor) => void }) {
  const { timeFormat } = useDisplay();
  if ("allDay" in entry) return <SharedAllDayChip item={entry.allDay} onOpen={onOpen} />;
  const { block } = entry;
  const text = block.level === "details" ? block.title || "Busy" : "Busy";
  if (block.invite) {
    const invite = block.invite;
    const when = sharedWhen(block.startAt, block.endAt, timeZone, timeFormat);
    return (
      <button
        type="button"
        data-invite={invite.answer}
        aria-label={inviteLabel(text, when, block.person, invite)}
        onClick={(e) => {
          e.stopPropagation();
          onOpen({ person: block.person, title: text, location: block.location, when, time: sharedTime(block.startAt, block.endAt, timeZone), invite }, anchorOf(e.currentTarget));
        }}
        className={`flex h-[18px] w-full min-w-0 items-center gap-1 rounded-md px-1 text-left text-[11px] leading-[16px] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 ${inviteClass(invite)}`}
      >
        <Avatar name={block.person.name} photoUrl={block.person.photoUrl} look={block.person.demo} size={16} />
        <span className="shrink-0 tabular text-ink-3">{fmtTime(block.startMin, timeFormat)}</span>
        <span className="min-w-0 truncate">{invite.answer === "tentative" ? `Maybe · ${text}` : text}</span>
      </button>
    );
  }
  const label = blockLabel(block, timeZone, timeFormat);
  const className = `flex h-[18px] w-full min-w-0 items-center gap-1 rounded-md px-1 text-left text-[11px] leading-[16px] ${SHARED_CLASS}`;
  const inner = (
    <>
      <Avatar name={block.person.name} photoUrl={block.person.photoUrl} look={block.person.demo} size={16} />
      <span className="shrink-0 tabular text-ink-3">{fmtTime(block.startMin, timeFormat)}</span>
      <span className="min-w-0 truncate">{text}</span>
    </>
  );
  if (block.level !== "details") {
    return (
      <div role="note" aria-label={label} style={SHARED_STRIPES} className={className}>
        {inner}
      </div>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      style={SHARED_STRIPES}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(
          {
            person: block.person,
            title: text,
            location: block.location,
            when: sharedWhen(block.startAt, block.endAt, timeZone, timeFormat),
            time: sharedTime(block.startAt, block.endAt, timeZone),
          },
          anchorOf(e.currentTarget),
        );
      }}
      className={`${className} hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40`}
    >
      {inner}
    </button>
  );
}
