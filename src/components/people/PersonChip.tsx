"use client";

// A person named outside their own card or profile (spec 33): avatar and shown name, a link to their
// profile page. Resting the mouse on it (after a short delay) or focusing it with the keyboard opens a
// small hover card built on the app's floating panel: avatar, name, bio line, local time, the e-mail
// address where the viewer may see it, what they share, "Open profile" and, when they share their
// calendar, "Show in calendar". It closes when the pointer has left chip and card, on Escape and when
// the focus leaves both; it never takes or traps the focus. Touch has no hover: a tap follows the link.
// The card loads nothing: it shows only what the page passed in. With nothing to show beyond id and
// name, the chip is just the link. Open and close rules: src/lib/people/hover.ts.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FocusEvent, type PointerEvent as ReactPointerEvent } from "react";
import { CalendarClock, CalendarDays, ChartColumn, Clock } from "lucide-react";
import { anchorOf, FloatingPanel, type Anchor } from "@/components/calendar/FloatingPanel";
import { useMinuteClock } from "@/components/profile/parts";
import { useDisplay } from "@/components/shell/DisplayProvider";
import { Avatar, type AvatarSize } from "@/components/ui/Avatar";
import { DemoTag } from "@/components/ui/DemoTag";
import { CLOSE_DELAY_MS, CLOSED, nextHover, OPEN_DELAY_MS, type HoverEvent, type HoverState } from "@/lib/people/hover";
import { bioLine, localTimeLabel, shareMarks, type ShareMark } from "@/lib/people/present";
import type { AvatarLook } from "@/lib/profiles/types";
import type { ShareSetting } from "@/lib/shares/types";

/** What a page may know of a person. Everything but id and name is optional. */
export type ChipPerson = {
  userId: string;
  name: string;
  photoUrl: string | null;
  /** A demo contact (spec 32): initials on a colour, and the "Demo" tag. */
  look?: AvatarLook;
  /** Only where the viewer may see it (R43, R46). */
  email?: string | null;
  bio?: string | null;
  timeZone?: string | null;
  /** What they share with the viewer. */
  shared?: ShareSetting | null;
};

export const profileHref = (userId: string) => `/people/${encodeURIComponent(userId)}`;
export const calendarHref = (userId: string) => `/?share=${encodeURIComponent(userId)}`;

/** Whether the card would show anything beyond the chip itself. */
export function hasCard(person: ChipPerson): boolean {
  return Boolean(person.email || bioLine(person.bio) || person.timeZone || shareMarks(person.shared).length > 0);
}

const MARK_ICON: Record<ShareMark["kind"], typeof Clock> = {
  "calendar-busy": CalendarClock,
  "calendar-details": CalendarDays,
  focus: ChartColumn,
};

/** Small quiet icons of what the person shares with the viewer, each with its words for screen readers. */
export function ShareMarks({ shared, className = "" }: { shared: ShareSetting | null | undefined; className?: string }) {
  const marks = shareMarks(shared);
  if (marks.length === 0) return null;
  return (
    <ul aria-label="Shares with you" className={`flex items-center gap-1.5 text-ink-3 ${className}`}>
      {marks.map((mark) => {
        const Icon = MARK_ICON[mark.kind];
        return (
          <li key={mark.kind} title={mark.label} className="inline-flex">
            <Icon className="size-4" strokeWidth={1.8} aria-hidden="true" />
            <span className="sr-only">{mark.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** The hover card's content. Exported for the markup tests (a hover cannot be rendered on the server). */
export function PersonHoverCard({ person, now }: { person: ChipPerson; now: string }) {
  const { timeFormat } = useDisplay();
  const at = useMinuteClock(now);
  const bio = bioLine(person.bio);
  const time = person.timeZone ? localTimeLabel(at, person.timeZone, timeFormat) : null;
  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={person.name} photoUrl={person.photoUrl} look={person.look} size={48} />
        <div className="min-w-0">
          <p className="flex min-w-0 items-center gap-2 text-[15px] font-semibold text-ink">
            <span className="truncate">{person.name}</span>
            {person.look && <DemoTag />}
          </p>
          {person.email && <p className="truncate text-xs text-ink-3">{person.email}</p>}
        </div>
      </div>
      {bio && (
        <p dir="auto" className="truncate text-sm text-ink-2">
          {bio}
        </p>
      )}
      {time && (
        <p className="flex items-center gap-1.5 text-xs text-ink-3">
          <Clock className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
          <span className="tabular">{time}</span>
        </p>
      )}
      <ShareMarks shared={person.shared} />
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
        <Link href={profileHref(person.userId)} className="font-medium text-ink underline-offset-2 hover:underline">
          Open profile
        </Link>
        {person.shared && person.shared.calendar !== "none" && (
          <Link href={calendarHref(person.userId)} className="font-medium text-ink-2 underline-offset-2 hover:underline">
            Show in calendar
          </Link>
        )}
      </div>
    </div>
  );
}

/** What one hover card needs to move from state to state: its refs and setters. */
type Machine = {
  hover: { current: HoverState };
  timer: { current: ReturnType<typeof setTimeout> | null };
  link: { current: HTMLAnchorElement | null };
  setOpen: (open: boolean) => void;
  setAnchor: (anchor: Anchor) => void;
};

/** Applies one event (src/lib/people/hover.ts) and runs the timer it asks for. */
function step(m: Machine, event: HoverEvent): void {
  const next = nextHover(m.hover.current, event);
  m.hover.current = next.state;
  if (next.timer !== null && m.timer.current) {
    clearTimeout(m.timer.current);
    m.timer.current = null;
  }
  if (next.timer === "open") m.timer.current = setTimeout(() => step(m, "open-delay-passed"), OPEN_DELAY_MS);
  if (next.timer === "close") m.timer.current = setTimeout(() => step(m, "close-delay-passed"), CLOSE_DELAY_MS);
  if (next.state.open && m.link.current) m.setAnchor(anchorOf(m.link.current));
  m.setOpen(next.state.open);
}

export function PersonChip({
  person,
  size = 24,
  now,
  className = "",
}: {
  person: ChipPerson;
  size?: AvatarSize;
  /** When the page was read (ISO), for the local time in the card. */
  now?: string;
  className?: string;
}) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hover = useRef<HoverState>(CLOSED);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const withCard = hasCard(person);

  // The setters and refs are stable, so one handle serves every event for the chip's whole life.
  const [machine] = useState<Machine>(() => ({ hover, timer, link: linkRef, setOpen, setAnchor }));
  const send = useCallback((event: HoverEvent) => step(machine, event), [machine]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // Mouse and pen only: touch has no hover, a tap follows the link.
  const pointer = (event: HoverEvent) => (e: ReactPointerEvent) => {
    if (e.pointerType !== "touch") send(event);
  };
  const inside = (node: EventTarget | null) =>
    node instanceof Node && Boolean(linkRef.current?.contains(node) || cardRef.current?.contains(node));

  const label = (
    <>
      <Avatar name={person.name} photoUrl={person.photoUrl} look={person.look} size={size} />
      <span className="min-w-0 truncate">{person.name}</span>
      {person.look && <DemoTag />}
    </>
  );
  const linkClass = `inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md text-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 ${className}`;

  if (!withCard) {
    return (
      <Link href={profileHref(person.userId)} className={linkClass}>
        {label}
      </Link>
    );
  }

  return (
    <span
      className="inline-flex min-w-0 max-w-full"
      onFocus={(e: FocusEvent) => {
        // The keyboard opens it; a mouse click that focuses the link does not.
        if (e.target === linkRef.current && !linkRef.current?.matches(":focus-visible")) return;
        send("focus-in");
      }}
      onBlur={(e: FocusEvent) => {
        if (!inside(e.relatedTarget)) send("focus-out");
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && hover.current.open) {
          e.preventDefault();
          send("escape");
        }
      }}
    >
      <Link
        ref={linkRef}
        href={profileHref(person.userId)}
        aria-haspopup="dialog"
        aria-expanded={open}
        onPointerEnter={pointer("chip-enter")}
        onPointerLeave={pointer("chip-leave")}
        className={linkClass}
      >
        {label}
      </Link>
      {open && anchor && (
        <FloatingPanel
          anchor={anchor}
          label={`${person.name}, contact card`}
          width={280}
          passive
          onClose={() => send("escape")}
          onPointerEnter={pointer("card-enter")}
          onPointerLeave={pointer("card-leave")}
        >
          <div ref={cardRef}>
            <PersonHoverCard person={person} now={now ?? new Date().toISOString()} />
          </div>
        </FloatingPanel>
      )}
    </span>
  );
}
