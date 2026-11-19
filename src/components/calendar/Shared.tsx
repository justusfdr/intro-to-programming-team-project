"use client";

// Other people's shared calendars on the viewer's calendar (spec 53, from spec 29; R56, R57, R58). Everything here is
// read only: a shared block cannot be dragged, resized or opened in the editor. Each shown person has a
// colour of their own (src/lib/shares/colors.ts): their blocks are filled with it, carry a bar at the
// left edge and the person's avatar; "busy" blocks say "Busy" and are not buttons; a "details" block
// opens a small card with title, time, place and whose calendar it is. Placement maths:
// src/lib/shares/place.ts.
// Spec 54 (from spec 36): an event the viewer is invited to goes through the same placement, carrying its
// invitation (`invite`). It is drawn in the look of R61 instead of a person's colour: no answer yet white
// with a dashed border in ink, maybe the same with lighter text and "Maybe", accepted solid like one of
// the viewer's own events; always with the inviter's avatar. A click opens the invitation's card.
import { createContext, useContext, useId, useState, type CSSProperties } from "react";
import { Users } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { PersonChip } from "@/components/people/PersonChip";
import { Button } from "@/components/ui/Button";
import { useDisplay } from "@/components/shell/DisplayProvider";
import { blockBox, type GridRange } from "@/lib/events/grid";
import { preferredColor, shareColor, type ShareColor, type ShareColorName } from "@/lib/shares/colors";
import type { InviteMark, SharedAllDayItem, SharedBlock } from "@/lib/shares/place";
import { answerWords, inviteClass } from "@/lib/invites/types";
import { MAX_SHOWN_CALENDARS, levelText, type CalendarLevel, type SharingPerson } from "@/lib/shares/types";
import { fmtDateLong, fmtRange, fmtTime, type TimeFormat } from "@/lib/time/display";
import { localDateTimeOf } from "@/lib/time/zoned";
import { anchorOf, FloatingPanel, type Anchor } from "./FloatingPanel";

/**
 * The colour of each person shown on the calendar (the calendar page sets it, so the people shown
 * together never share one). Anywhere else a person has the colour that is always theirs.
 */
export const ShareColors = createContext<Readonly<Record<string, ShareColorName>>>({});

/** The class names of a person's colour: the look of everything on screen that is theirs. */
export function useShareColor(userId: string): ShareColor {
  const colors = useContext(ShareColors);
  return shareColor(colors[userId] ?? preferredColor(userId));
}

/** The bar at the left edge that every shared block, chip and row has (the colour comes with the person). */
const SHARED_BAR = "border-l-[3px]";

/** What the read-only card shows: one shared event with whose it is. */
export type OpenShared = {
  person: SharingPerson;
  title: string;
  location: string | null;
  /** "Monday, November 16, 9 – 11am" or "Monday, November 16 to Wednesday, November 18 (all day)". */
  when: string;
  /** Spec 54: an event the viewer is invited to (the person is who invited them). */
  invite?: InviteMark;
};

/** "Group project meeting, Friday, November 20, 11am – 12pm, invited by Ana, your answer: maybe". */
function inviteLabel(title: string, when: string, person: SharingPerson, invite: InviteMark): string {
  return `${title}, ${when}, invited by ${person.name}, your answer: ${answerWords(invite.answer)}`;
}

/** The focus ring and hover of every invited block, chip and row. */
const INVITE_FOCUS = "cursor-pointer hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40";

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
  levels,
}: {
  people: readonly SharingPerson[];
  chosen: readonly string[];
  onToggle: (userId: string) => void;
  /**
   * The level each shown calendar had when it was last read. The list of people is from the page's load;
   * a level the person changed since then shows here, as it does on their blocks.
   */
  levels?: Readonly<Record<string, CalendarLevel>>;
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  if (people.length === 0) return null;
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
          <SharedPeopleList people={people} chosen={chosen} onToggle={onToggle} levels={levels} />
        </FloatingPanel>
      )}
    </>
  );
}

/** What the "People" menu shows: each person who shares their calendar, to tick on or off (also used by the tests). */
export function SharedPeopleList({
  people,
  chosen,
  onToggle,
  levels,
}: {
  people: readonly SharingPerson[];
  chosen: readonly string[];
  onToggle: (userId: string) => void;
  levels?: Readonly<Record<string, CalendarLevel>>;
}) {
  const hintId = useId();
  const full = chosen.length >= MAX_SHOWN_CALENDARS;
  return (
    <div className="flex flex-col gap-2 p-4">
      <p className="pr-8 text-sm font-semibold text-ink">People&apos;s calendars</p>
      <p id={hintId} className="text-xs text-ink-3">
        Read only. Show up to {MAX_SHOWN_CALENDARS} at once.
      </p>
      <ul className="flex flex-col">
        {people.map((person) => (
          <PersonOption
            key={person.userId}
            person={person}
            on={chosen.includes(person.userId)}
            full={full}
            level={levels?.[person.userId] ?? person.calendar}
            hintId={hintId}
            onToggle={onToggle}
          />
        ))}
      </ul>
    </div>
  );
}

/** One person of the "People" menu: the tick, their avatar and name, their colour while shown, and the level. */
function PersonOption({
  person,
  on,
  full,
  level,
  hintId,
  onToggle,
}: {
  person: SharingPerson;
  on: boolean;
  full: boolean;
  level: CalendarLevel;
  hintId: string;
  onToggle: (userId: string) => void;
}) {
  const color = useShareColor(person.userId);
  return (
    <li>
      <label className={`flex items-center gap-2.5 rounded-lg px-1 py-1.5 text-sm ${!on && full ? "opacity-50" : "cursor-pointer hover:bg-raised"}`}>
        <input
          type="checkbox"
          checked={on}
          disabled={!on && full}
          aria-describedby={hintId}
          onChange={() => onToggle(person.userId)}
          className="size-4 shrink-0 accent-ink"
        />
        <Avatar name={person.name} photoUrl={person.photoUrl} size={24} />
        <span className="min-w-0 flex-1 truncate text-ink">{person.name}</span>
        {on && (
          <span className={`size-2.5 shrink-0 rounded-full ${color.dot}`}>
            <span className="sr-only">Shown in {color.name}</span>
          </span>
        )}
        <span className="shrink-0 text-xs text-ink-3">{levelText(level)}</span>
      </label>
    </li>
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
  const color = useShareColor(block.person.userId);
  const { top, height } = blockBox(block, range);
  const laneWidth = width / block.lanes;
  const style = {
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
        <Avatar name={block.person.name} photoUrl={block.person.photoUrl} size={16} />
        <span className="min-w-0 truncate text-[11px] font-medium leading-[14px]">{text}</span>
      </span>
      {height >= 44 && <span className={`block truncate text-[10px] leading-[13px] tabular ${color.subtext}`}>{time}</span>}
    </>
  );
  const className = `absolute z-[1] overflow-hidden rounded-lg px-1 py-0.5 text-left ${SHARED_BAR} ${color.block}`;
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
          { person: block.person, title: block.title || "Busy", location: block.location, when: sharedWhen(block.startAt, block.endAt, timeZone, timeFormat) },
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
 * Spec 54: an event the viewer is invited to, as a read-only block in a day column: the inviter's small
 * avatar, the title, "Maybe" when that is the answer. A click opens its card; it is never dragged,
 * resized or opened in the editor (R63).
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
  style: CSSProperties;
  height: number;
  timeZone: string;
  onOpen: (shared: OpenShared, anchor: Anchor) => void;
}) {
  const { timeFormat } = useDisplay();
  const title = block.title || "Invitation";
  const when = sharedWhen(block.startAt, block.endAt, timeZone, timeFormat);
  const time = fmtRange(block.startMin, block.endMin, timeFormat);
  return (
    <button
      type="button"
      data-invite={invite.answer}
      aria-label={inviteLabel(title, when, block.person, invite)}
      // The part after midnight repeats a block of the day before: not a second tab stop.
      tabIndex={block.continuesBefore ? -1 : undefined}
      aria-hidden={block.continuesBefore || undefined}
      style={style}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onOpen({ person: block.person, title, location: block.location, when, invite }, anchorOf(e.currentTarget));
      }}
      className={`pointer-events-auto absolute z-[1] overflow-hidden rounded-lg px-1 py-0.5 text-left ${INVITE_FOCUS} ${inviteClass(invite.answer)}`}
    >
      <span className="flex items-center gap-1">
        <Avatar name={block.person.name} photoUrl={block.person.photoUrl} size={16} />
        <span className="min-w-0 truncate text-[11px] font-medium leading-[14px]">{title}</span>
      </span>
      {height >= 44 && <span className="block truncate text-[10px] leading-[13px] tabular opacity-80">{invite.answer === "tentative" ? `Maybe · ${time}` : time}</span>}
      {height < 44 && invite.answer === "tentative" && <span className="sr-only">Maybe</span>}
    </button>
  );
}

/** A shared all-day event as a small chip in the person's colour (all-day row and month view). */
export function SharedAllDayChip({ item, onOpen }: { item: SharedAllDayItem; onOpen: (shared: OpenShared, anchor: Anchor) => void }) {
  const color = useShareColor(item.person.userId);
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
          onOpen({ person: item.person, title: text, location: item.event.location ?? null, when, invite }, anchorOf(e.currentTarget));
        }}
        className={`flex h-[18px] w-full min-w-0 items-center gap-1 rounded-md px-1 text-left text-[11px] leading-[16px] ${INVITE_FOCUS} ${inviteClass(invite.answer)}`}
      >
        <Avatar name={item.person.name} photoUrl={item.person.photoUrl} size={16} />
        <span className="min-w-0 truncate">{invite.answer === "tentative" ? `Maybe · ${text}` : text}</span>
      </button>
    );
  }
  const label = `${text}, ${when}, ${whose(item.person)}, read only`;
  const className = `flex h-[18px] w-full min-w-0 items-center gap-1 rounded-md px-1 text-left text-[11px] leading-[16px] ${SHARED_BAR} ${color.block}`;
  const inner = (
    <>
      <Avatar name={item.person.name} photoUrl={item.person.photoUrl} size={16} />
      <span className="min-w-0 truncate">{text}</span>
    </>
  );
  if (item.level !== "details") {
    return (
      <div role="note" aria-label={label} className={className}>
        {inner}
      </div>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onOpen({ person: item.person, title: text, location: item.event.location ?? null, when }, anchorOf(e.currentTarget));
      }}
      className={`${className} hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40`}
    >
      {inner}
    </button>
  );
}

/** What the read-only card shows: title, time, place, whose calendar (also used by the previews). */
export function SharedEventDetails({ shared }: { shared: OpenShared }) {
  const color = useShareColor(shared.person.userId);
  return (
    <div className="flex flex-col gap-2 p-4">
      <p className="flex items-center gap-2 pr-8 text-[15px] font-semibold text-ink">
        <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${color.dot}`} />
        <span className="min-w-0">{shared.title}</span>
      </p>
      <p className="text-sm text-ink-2">{shared.when}</p>
      {shared.location && <p className="text-sm text-ink-2">{shared.location}</p>}
      <p className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-ink-3">
        <span>From</span>
        {/* The person's name is a plain link to their profile (spec 53, from spec 33). */}
        {/* "'s" sits right after the name, without the gap between the other words. */}
        <span className="inline-flex min-w-0 max-w-full items-center">
          <PersonChip person={{ userId: shared.person.userId, name: shared.person.name, photoUrl: shared.person.photoUrl }} className="text-xs font-medium" />
          <span>&apos;s calendar.</span>
        </span>
        <span>Read only.</span>
      </p>
    </div>
  );
}

/** The read-only card of a shared "details" event: title, time, place, whose calendar. */
export function SharedEventCard({ shared, anchor, onClose }: { shared: OpenShared; anchor: Anchor; onClose: () => void }) {
  return (
    <FloatingPanel anchor={anchor} label={`${shared.title}, from ${whose(shared.person)}`} width={300} onClose={onClose}>
      <SharedEventDetails shared={shared} />
    </FloatingPanel>
  );
}

/** One shared entry of a month cell: an all-day event, or the start of a timed one. */
export type SharedMonthEntry = { key: string; allDay: SharedAllDayItem } | { key: string; block: SharedBlock };

/** A month cell's shared entry: "9am Busy" with the avatar, in the person's colour; a "details" one opens the card. */
export function SharedMonthRow({ entry, timeZone, onOpen }: { entry: SharedMonthEntry; timeZone: string; onOpen: (shared: OpenShared, anchor: Anchor) => void }) {
  if ("allDay" in entry) return <SharedAllDayChip item={entry.allDay} onOpen={onOpen} />;
  return <SharedMonthBlock block={entry.block} timeZone={timeZone} onOpen={onOpen} />;
}

/** A shared timed event in a month cell: the time it starts and "Busy" or its title. */
function SharedMonthBlock({ block, timeZone, onOpen }: { block: SharedBlock; timeZone: string; onOpen: (shared: OpenShared, anchor: Anchor) => void }) {
  const { timeFormat } = useDisplay();
  const color = useShareColor(block.person.userId);
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
          onOpen({ person: block.person, title: text, location: block.location, when, invite }, anchorOf(e.currentTarget));
        }}
        className={`flex h-[18px] w-full min-w-0 items-center gap-1 rounded-md px-1 text-left text-[11px] leading-[16px] ${INVITE_FOCUS} ${inviteClass(invite.answer)}`}
      >
        <Avatar name={block.person.name} photoUrl={block.person.photoUrl} size={16} />
        <span className="shrink-0 tabular opacity-80">{fmtTime(block.startMin, timeFormat)}</span>
        <span className="min-w-0 truncate">{invite.answer === "tentative" ? `Maybe · ${text}` : text}</span>
      </button>
    );
  }
  const label = blockLabel(block, timeZone, timeFormat);
  const className = `flex h-[18px] w-full min-w-0 items-center gap-1 rounded-md px-1 text-left text-[11px] leading-[16px] ${SHARED_BAR} ${color.block}`;
  const inner = (
    <>
      <Avatar name={block.person.name} photoUrl={block.person.photoUrl} size={16} />
      <span className={`shrink-0 tabular ${color.subtext}`}>{fmtTime(block.startMin, timeFormat)}</span>
      <span className="min-w-0 truncate">{text}</span>
    </>
  );
  if (block.level !== "details") {
    return (
      <div role="note" aria-label={label} className={className}>
        {inner}
      </div>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onOpen({ person: block.person, title: text, location: block.location, when: sharedWhen(block.startAt, block.endAt, timeZone, timeFormat) }, anchorOf(e.currentTarget));
      }}
      className={`${className} hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40`}
    >
      {inner}
    </button>
  );
}
