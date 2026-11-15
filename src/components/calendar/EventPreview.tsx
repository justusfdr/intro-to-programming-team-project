"use client";

// The event preview (spec 35): a single click on an event opens this panel at the right of the calendar
// instead of the editor. It shows what the calendar already has (goal, title, time, series, guests,
// to-dos, notes, place) and, for an address, the travel line (R27) and a map. Nothing here can be
// changed; "Edit" opens the existing editor. Other people's shared events open it too, without "Edit"
// and without asking for their place on the map.
// From 1024 px a 360 px column beside the calendar (the calendar shrinks); from 768 px it lies over the
// right part of the calendar; on phones it is a sheet from the bottom. A labelled region: Escape and the
// close button close it, and the calendar gives the focus back to the event.
//
// The map is OpenStreetMap's own embed. It is loaded only once the panel is open for an event whose
// place our server found (GET /api/events/[id]/place); its address is built from two checked numbers
// (lib/map/osm-embed.ts). Loading it tells OpenStreetMap the coordinates and the visitor's address.
import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { CalendarClock, ExternalLink, Link2, ListChecks, MapPin, Pencil, Repeat, StickyNote, Users, X } from "lucide-react";
import { PersonChip } from "@/components/people/PersonChip";
import { useDisplay } from "@/components/shell/DisplayProvider";
import { Button } from "@/components/ui/Button";
import { getJson } from "@/lib/client/post-json";
import { ownPreview, placeOf, todoProgress, whenSentence, type GuestPerson, type GuestRow, type PlaceView } from "@/lib/events/preview";
import type { CalendarEvent } from "@/lib/events/types";
import { goalColor } from "@/lib/goals/colors";
import type { GoalColorName } from "@/lib/goals/style";
import { mapUrls } from "@/lib/map/osm-embed";
import type { TimeFormat } from "@/lib/time/display";
import type { TodoDto } from "@/lib/todos/types";
import type { TravelAnswer } from "@/lib/travel/types";
import { TravelLineView } from "./editor/TravelLine";
import { anchorOf, type Anchor } from "./FloatingPanel";
import type { OpenShared } from "./Shared";
import { InvitedPreviewBody, InviteesList } from "./Invites";
import type { GivenAnswer, InviteAnswer, InvitedEvent, InvitePerson } from "@/lib/invites/types";
import type { GoalLabel } from "./TimeGrid";

/**
 * What the panel is open for: one of the user's own events, a shared event of a contact, or (spec 36) an
 * event the user is invited to, with their answer and what answering does.
 */
export type PreviewTarget =
  | { kind: "own"; event: CalendarEvent }
  | { kind: "shared"; shared: OpenShared }
  | { kind: "invite"; event: InvitedEvent; answer: InviteAnswer; busy: boolean; note: string | null; onAnswer: (answer: GivenAnswer) => void };

/** The place as our server found it for the map; "loading" while it is asked. */
export type PlaceState = "loading" | { status: "found"; lat: number; lon: number } | { status: "none" | "not_found" | "unavailable" };

/** The travel line's answer; "loading" while it is asked; null when there is none to show. */
export type TravelState = "loading" | TravelAnswer | null;

const HEADING_ID = "event-preview-title";

type PanelProps = {
  target: PreviewTarget;
  goals: GoalLabel[];
  guestPeople: Readonly<Record<string, GuestPerson>>;
  timeZone: string;
  /** Move the focus to the heading (it was opened by the keyboard). */
  focusOnOpen: boolean;
  onEdit: (event: CalendarEvent, anchor: Anchor) => void;
  onClose: () => void;
  /** Spec 36: the people the user invited to their own events, by event id. */
  invitees?: Readonly<Record<string, InvitePerson[]>>;
};

/** The panel with its frame, its asking and its keyboard handling. */
export function EventPreview({ target, goals, guestPeople, timeZone, focusOnOpen, onEdit, onClose, invitees }: PanelProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const targetKey =
    target.kind === "own"
      ? `own:${target.event.id}`
      : target.kind === "invite"
        ? `invite:${target.event.inviteId}`
        : `shared:${target.shared.person.userId}:${target.shared.title}:${target.shared.when}`;

  // Opened (or switched) by the keyboard: the focus goes to the heading, so the panel is read next.
  useEffect(() => {
    if (focusOnOpen) heading.current?.focus();
  }, [focusOnOpen, targetKey]);

  // Escape closes it, unless a dialog (the editor, a small card) is open over it and takes the key itself.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"],[aria-modal="true"],dialog[open]')) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside
      role="region"
      aria-labelledby={HEADING_ID}
      data-event-preview
      className="fixed inset-x-0 bottom-0 z-50 flex max-h-[80dvh] flex-col overflow-hidden rounded-t-panel border border-line-subtle bg-canvas shadow-pop md:inset-x-auto md:top-0 md:right-0 md:h-dvh md:max-h-none md:w-[360px] md:rounded-none md:border-y-0 md:border-r-0 lg:sticky lg:z-auto lg:shrink-0 lg:shadow-none"
    >
      <div className="flex items-center justify-end gap-1 px-3 pt-3">
        {target.kind === "own" && (
          <Button variant="secondary" size="sm" onClick={(e) => onEdit(target.event, anchorOf(e.currentTarget))}>
            <Pencil className="size-3.5" strokeWidth={2} />
            Edit
          </Button>
        )}
        <button
          type="button"
          aria-label="Close preview"
          title="Close (Esc)"
          onClick={onClose}
          className="inline-flex size-8 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
        >
          <X className="size-4" strokeWidth={2} />
        </button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pt-1 pb-6">
        {target.kind === "own" ? (
          <OwnEventPreview
            key={target.event.id}
            event={target.event}
            goals={goals}
            guestPeople={guestPeople}
            timeZone={timeZone}
            headingRef={heading}
            invitees={invitees?.[target.event.id] ?? NO_PEOPLE}
          />
        ) : target.kind === "invite" ? (
          <InvitedPreviewBody
            key={target.event.inviteId}
            event={target.event}
            answer={target.answer}
            busy={target.busy}
            note={target.note}
            timeZone={timeZone}
            headingId={HEADING_ID}
            headingRef={heading}
            onAnswer={target.onAnswer}
          />
        ) : (
          <SharedPreview shared={target.shared} headingRef={heading} />
        )}
      </div>
    </aside>
  );
}

/** One of the user's own events: asks for its to-dos, travel line and place, then shows them. */
function OwnEventPreview({
  event,
  goals,
  guestPeople,
  timeZone,
  headingRef,
  invitees,
}: {
  event: CalendarEvent;
  goals: GoalLabel[];
  guestPeople: Readonly<Record<string, GuestPerson>>;
  timeZone: string;
  headingRef: Ref<HTMLHeadingElement>;
  invitees: readonly InvitePerson[];
}) {
  const { timeFormat } = useDisplay();
  const todos = useOpenTodos(event);
  const address = placeOf(event.location).kind === "address";
  const travel = useTravel(event, address && !event.allDay);
  const place = usePlace(event, address);
  return (
    <OwnPreviewBody
      event={event}
      goals={goals}
      guestPeople={guestPeople}
      timeZone={timeZone}
      timeFormat={timeFormat}
      openTodos={todos}
      travel={travel}
      place={place}
      headingRef={headingRef}
      invitees={invitees}
    />
  );
}

const NO_PEOPLE: readonly InvitePerson[] = [];

/** The open to-dos' titles, asked once per version of the event (null while asking or when there are none). */
function useOpenTodos(event: CalendarEvent): string[] | null {
  const wanted = event.source !== "outlook" && (event.todoCount ?? 0) > 0;
  const key = `${event.id}@${event.updatedAt}@${event.todosDone ?? 0}/${event.todoCount ?? 0}`;
  const [answer, setAnswer] = useState<{ key: string; open: string[] } | null>(null);
  useEffect(() => {
    if (!wanted) return;
    let current = true;
    void getJson(`/api/events/${encodeURIComponent(event.id)}/todos`).then((result) => {
      if (!current || !result.ok) return;
      const list = (result.data as { todos?: TodoDto[] } | undefined)?.todos;
      if (Array.isArray(list)) setAnswer({ key, open: list.filter((t) => !t.done).map((t) => String(t.title)) });
    });
    return () => {
      current = false;
    };
  }, [wanted, key, event.id]);
  return wanted && answer?.key === key ? answer.open : null;
}

/** The travel line (R27), asked from travel_time like the editor's line. */
function useTravel(event: CalendarEvent, wanted: boolean): TravelState {
  const key = `${event.id}@${event.updatedAt}`;
  const [answer, setAnswer] = useState<{ key: string; travel: TravelAnswer | null } | null>(null);
  useEffect(() => {
    if (!wanted) return;
    let current = true;
    void getJson(`/api/events/${encodeURIComponent(event.id)}/travel`).then((result) => {
      if (!current) return;
      const travel = result.ok ? ((result.data as { travel?: TravelAnswer | null } | undefined)?.travel ?? null) : null;
      setAnswer({ key, travel });
    });
    return () => {
      current = false;
    };
  }, [wanted, key, event.id]);
  if (!wanted) return null;
  return answer?.key === key ? answer.travel : "loading";
}

/** Where the place is, for the map: asked only while the panel is open for an event with an address. */
function usePlace(event: CalendarEvent, wanted: boolean): PlaceState {
  const key = `${event.id}@${event.location ?? ""}`;
  const [answer, setAnswer] = useState<{ key: string; place: Exclude<PlaceState, "loading"> } | null>(null);
  useEffect(() => {
    if (!wanted) return;
    let current = true;
    void getJson(`/api/events/${encodeURIComponent(event.id)}/place`).then((result) => {
      if (!current) return;
      const data = result.data as { status?: unknown; lat?: unknown; lon?: unknown } | undefined;
      const place: Exclude<PlaceState, "loading"> =
        result.ok && data?.status === "found" && typeof data.lat === "number" && typeof data.lon === "number"
          ? { status: "found", lat: data.lat, lon: data.lon }
          : result.ok && (data?.status === "none" || data?.status === "not_found")
            ? { status: data.status }
            : { status: "unavailable" };
      setAnswer({ key, place });
    });
    return () => {
      current = false;
    };
  }, [wanted, key, event.id]);
  if (!wanted) return { status: "none" };
  return answer?.key === key ? answer.place : "loading";
}

type BodyProps = {
  event: CalendarEvent;
  goals: GoalLabel[];
  guestPeople: Readonly<Record<string, GuestPerson>>;
  timeZone: string;
  timeFormat: TimeFormat;
  /** The open to-dos' titles, or null while unknown. */
  openTodos: string[] | null;
  travel: TravelState;
  place: PlaceState;
  headingRef?: Ref<HTMLHeadingElement>;
  /** Spec 36: the people invited in the app, with their answers. */
  invitees?: readonly InvitePerson[];
};

/** What the panel shows of one of the user's own events, top to bottom (also drawn on its own in the tests). */
export function OwnPreviewBody({ event, goals, guestPeople, timeZone, timeFormat, openTodos, travel, place, headingRef, invitees = NO_PEOPLE }: BodyProps) {
  const view = ownPreview(
    event,
    goals.map((g) => ({ id: g.id, title: g.title, color: g.look.color })),
    guestPeople,
    timeFormat,
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        {view.goal && (
          <p className="flex items-center gap-2 text-xs font-medium text-ink-2">
            <span aria-hidden className={`size-2 shrink-0 rounded-full ${goalColor(view.goal.color as GoalColorName).dot}`} />
            <span className="min-w-0 truncate">{view.goal.title}</span>
          </p>
        )}
        <h2 id={HEADING_ID} ref={headingRef} tabIndex={-1} className="text-[19px] font-semibold leading-snug tracking-snug text-ink break-words focus-visible:outline-none">
          {view.title}
        </h2>
        <p className="flex items-start gap-2 text-sm text-ink-2">
          <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" strokeWidth={1.8} />
          <span>{view.when}</span>
        </p>
        {view.repeats && (
          <p className="flex items-center gap-2 text-sm text-ink-2">
            <Repeat aria-hidden className="size-4 shrink-0 text-ink-3" strokeWidth={1.8} />
            <span>Repeats (part of a series)</span>
          </p>
        )}
      </div>

      {/* Spec 36: the people invited in the app, apart from the guests by e-mail (Outlook). */}
      {invitees.length > 0 && (
        <Part icon={<Users className="size-4" strokeWidth={1.8} />} title="People in LockedIn">
          <InviteesList people={invitees} />
        </Part>
      )}

      {view.guests.length > 0 && <GuestsPart rows={view.guests} />}

      {view.todos && (
        <Part icon={<ListChecks className="size-4" strokeWidth={1.8} />} title="To-dos">
          <p className="text-sm text-ink">{todoProgress(view.todos.done, view.todos.total)}</p>
          {openTodos && openTodos.length > 0 && (
            <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5 text-sm text-ink-2">
              {openTodos.map((title, i) => (
                <li key={`${i}-${title}`} className="break-words">
                  {title}
                </li>
              ))}
            </ul>
          )}
        </Part>
      )}

      {view.notes && (
        <Part icon={<StickyNote className="size-4" strokeWidth={1.8} />} title="Notes">
          {/* Plain text: React escapes it, and the line breaks stay. Never HTML. */}
          <p className="text-sm whitespace-pre-wrap break-words text-ink">{view.notes}</p>
        </Part>
      )}

      {view.place.kind !== "none" && <PlacePart place={view.place} travel={travel} map={place} timeZone={timeZone} timeFormat={timeFormat} />}
    </div>
  );
}

/** A part of the panel with its small heading. */
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

/** The guests: a contact as their chip (to their profile), anyone else as the address; the organizer marked. */
function GuestsPart({ rows }: { rows: GuestRow[] }) {
  return (
    <Part icon={<Users className="size-4" strokeWidth={1.8} />} title="Guests">
      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.address} className="flex min-w-0 items-center gap-2 text-sm">
            {row.person ? (
              <PersonChip person={{ userId: row.person.userId, name: row.person.name, photoUrl: row.person.photoUrl }} size={24} className="text-sm" />
            ) : (
              <span className="min-w-0 truncate text-ink">{row.address}</span>
            )}
            {row.organizer && <span className="shrink-0 rounded-full bg-raised px-2 py-0.5 text-[11px] font-medium text-ink-2">Organizer</span>}
          </li>
        ))}
      </ul>
    </Part>
  );
}

/** The place: a safe link for an online meeting; for an address the text, the travel line and the map. */
function PlacePart({
  place,
  travel,
  map,
  timeZone,
  timeFormat,
}: {
  place: Exclude<PlaceView, { kind: "none" }>;
  travel: TravelState;
  map: PlaceState;
  timeZone: string;
  timeFormat: TimeFormat;
}) {
  return (
    <Part icon={<MapPin className="size-4" strokeWidth={1.8} />} title="Place">
      {place.kind === "link" ? (
        <a href={place.href} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-1.5 text-sm text-ink underline underline-offset-2 hover:text-ink-2">
          <Link2 aria-hidden className="size-4 shrink-0 text-ink-3" strokeWidth={1.8} />
          <span className="min-w-0 truncate">{place.text}</span>
        </a>
      ) : (
        <p className="text-sm break-words text-ink">{place.text}</p>
      )}
      {place.kind === "address" && (
        <>
          {/* The travel line when it can be worked out (or the hint to add a home address). */}
          {travel !== null && travel !== "loading" && (travel.status === "ok" || travel.status === "no_home") && (
            <TravelLineView travel={travel} timeZone={timeZone} timeFormat={timeFormat} unsaved={false} />
          )}
          <PlaceMap map={map} address={place.text} />
        </>
      )}
    </Part>
  );
}

/** OpenStreetMap's embedded map with the place marked, or why there is none. */
export function PlaceMap({ map, address }: { map: PlaceState; address: string }) {
  if (map === "loading") return <p className="text-xs text-ink-3">Finding the place on the map…</p>;
  if (map.status !== "found") {
    if (map.status === "none") return null;
    return <p className="text-xs text-ink-2">{map.status === "not_found" ? "Address not found on the map" : "The map is not available right now"}</p>;
  }
  const urls = mapUrls(map.lat, map.lon);
  if (!urls) return <p className="text-xs text-ink-2">Address not found on the map</p>;
  return (
    <div className="flex flex-col gap-1.5">
      <iframe
        title={`Map of ${address}`}
        src={urls.embed}
        loading="lazy"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin"
        className="h-[220px] w-full rounded-lg border border-line-subtle bg-raised"
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
        <a href={urls.open} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-ink-2 underline underline-offset-2 hover:text-ink">
          Open in OpenStreetMap
          <ExternalLink aria-hidden className="size-3" strokeWidth={2} />
        </a>
        <span className="text-ink-3">© OpenStreetMap contributors</span>
      </div>
    </div>
  );
}

/** A shared event of a contact (read only): title, time, place as text, whose calendar. No map, no "Edit". */
export function SharedPreview({ shared, headingRef }: { shared: OpenShared; headingRef?: Ref<HTMLHeadingElement> }) {
  const { timeFormat } = useDisplay();
  const when = shared.time ? whenSentence(shared.time, timeFormat) : shared.when;
  const place = placeOf(shared.location);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 id={HEADING_ID} ref={headingRef} tabIndex={-1} className="text-[19px] font-semibold leading-snug tracking-snug text-ink break-words focus-visible:outline-none">
          {shared.title}
        </h2>
        <p className="flex items-start gap-2 text-sm text-ink-2">
          <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" strokeWidth={1.8} />
          <span>{when}</span>
        </p>
      </div>
      {place.kind !== "none" && (
        <Part icon={<MapPin className="size-4" strokeWidth={1.8} />} title="Place">
          {/* Other people's places are never looked up for the map (spec 35): text only. */}
          <p className="text-sm break-words text-ink">{place.text}</p>
        </Part>
      )}
      <p className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-ink-3">
        <span>From</span>
        <PersonChip person={{ userId: shared.person.userId, name: shared.person.name, photoUrl: shared.person.photoUrl, look: shared.person.demo }} className="text-xs font-medium" />
        <span>&apos;s calendar. Read only.</span>
      </p>
    </div>
  );
}
