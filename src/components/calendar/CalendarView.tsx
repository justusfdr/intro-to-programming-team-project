"use client";

// The calendar screen in the prototype's layout (its components/calendar/CalendarScreen.tsx): the title
// (month and year, opens a month calendar to jump to a day) with the view's line below it, the toolbar
// (previous, next, Today, Day | Week | Month, "+" for a new event; goals have a page of their own since
// spec 39), on the day view the day strip, then the time grid or the month grid. Left out as decided:
// plan week, plan strength, the coach.
// Which view and which day live in the address (/?view=day&date=2026-11-18), so reload and back work;
// the page reads exactly those days on the server (src/app/page.tsx). Phones get day and month only.
// An action's change shows at once and the days are read again in the background (components/live/Live.tsx).
//
// Dragging (spec 15, as in the prototype): a click or a drag on free time opens the small "New event"
// card; a dropped block moves at once and edit_event saves it in the background with the event's
// updated_at (R4); if the server refuses, the block goes back and the ontology's message shows. After a
// move, a resize or a delete a toast offers "Undo" for 8 seconds. An event of a series asks "This
// event / This and following" on drop.
//
// Spec 53 (from spec 29): contacts who share their calendar with the viewer can be shown next to the
// viewer's own events ("People" in the toolbar, at most three). Their events are a separate kind of thing
// on the screen (src/lib/shares/place.ts): read only, never dragged, never in the editor, and never part
// of the viewer's overlap marks or questions (R10: `shownEvents`, `timed`, `tripWarned` and `overlapAt`
// are built from the viewer's own events only) or of what the coach gets (R22, R57).
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/Button";
import { newEventSlot, nextFullHour } from "@/lib/events/new-event-day";
import { clampHourPx, gridRange, HOUR_PX, minuteOfLocal, minuteToPx, placeWeek } from "@/lib/events/grid";
import { localAt, type Span } from "@/lib/events/drag";
import type { CalendarEvent, WeekData, WeekEvent } from "@/lib/events/types";
import {
  allowedViews,
  calendarHref,
  coerceView,
  isTypingTarget,
  navLabel,
  shortcutFor,
  stepDate,
  viewLabel,
  viewSubtitle,
  viewSubtitleShort,
  viewTitle,
  visibleDays,
  type View,
} from "@/lib/events/views";
import { leadInto, withEventChange } from "@/lib/events/week-view";
import { overlapOf, tripConflictIds, type NamedEvent, type Overlap } from "@/lib/events/conflicts";
import { OverlapNotice } from "./editor/OverlapNotice";
import { fmtDateLong, fmtWeekday } from "@/lib/time/display";
import { msToNextMinute } from "@/lib/time/next-minute";
import { localDateTimeOf, parseLocalDateTime } from "@/lib/time/zoned";
import type { NewTodo } from "@/lib/todos/types";
import { postJson, type PostResult } from "@/lib/client/post-json";
import { useDisplay } from "@/components/shell/DisplayProvider";
import { useLive, useLiveWeek } from "@/components/live/Live";
import { DateJumpTitle } from "./DateJump";
import { EventEditor, SeriesQuestion, type EditorState } from "./EventEditor";
import { deletedTodos, dropText, isGuestsError, movedChange, recreateBody, savedEvent, savedEventChange, timesBody, withoutGuests, type Scope } from "./event-changes";
import { anchorOf, FloatingPanel, type Anchor } from "./FloatingPanel";
import { MonthView } from "./MonthView";
import { NewEventPopover } from "./NewEventPopover";
import { useTravelTimes } from "./useTravelTimes";
import { OutlookChip } from "./OutlookChip";
import { TimeGrid, type GoalLabel } from "./TimeGrid";
import { SharedEventCard, SharedPeopleButton, type OpenShared, type SharedMonthEntry } from "./Shared";
import { useSharedCalendars } from "./useSharedCalendars";
import { placeShared, sharedAllDayByDay } from "@/lib/shares/place";
import type { SharingPerson } from "@/lib/shares/types";
import { MEDIA, useMediaQuery } from "./useMedia";

type Props = {
  /** The shown days (one, a week or the month's 42), with the view and day of the address. */
  week: WeekData;
  /** The current local time from the server, "2026-11-16T09:12", so the first render matches it. */
  nowLocal: string;
  /** The user's goals, for the colour and name of an event's goal. */
  goals: GoalLabel[];
  /** Outlook is set up on this server. */
  outlookAvailable?: boolean;
  /** Spec 47: an event to open in the editor at once (from "Next up" in the sidebar), if it is shown. */
  openEventId?: string;
  /** Spec 53: the signed-in user, whose browser remembers which shared calendars they chose to show. */
  viewerId?: string;
  /** Spec 53: the contacts who share their calendar with the viewer (none: no "People" button). */
  sharing?: SharingPerson[];
  /** Spec 53: a person the address asks to show ("?share=<id>", from "Show in my calendar"). */
  showPerson?: string;
};

const NO_PEOPLE: SharingPerson[] = [];

/** Minutes of lead time above "now" when today is shown, and above the earliest event otherwise. */
const SCROLL_CONTEXT_MIN = 90;
const SCROLL_LEAD_MIN = 30;
/** Where this browser remembers the zoom of the hours (the height of one hour in pixels). */
const HOUR_PX_KEY = "lockedin.calendar.hourPx";

const HOUR_PX_CHANGED = "lockedin:calendar-zoom";
/** The zoom when this browser cannot store it (private window, blocked site data): kept until the page is left. */
let hourPxInMemory: number | null = null;

function subscribeHourPx(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(HOUR_PX_CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(HOUR_PX_CHANGED, onChange);
  };
}

function readHourPx(): number {
  try {
    const raw = window.localStorage.getItem(HOUR_PX_KEY);
    if (raw) return clampHourPx(Number(raw));
  } catch {
    // No storage: the zoom of this page visit, if any.
  }
  return hourPxInMemory ?? HOUR_PX;
}

function saveHourPx(px: number) {
  hourPxInMemory = px;
  try {
    window.localStorage.setItem(HOUR_PX_KEY, String(px));
  } catch {
    // Not remembered; the zoom still works until the page is left.
  }
  window.dispatchEvent(new Event(HOUR_PX_CHANGED));
}

const noSubscription = () => () => {};

/**
 * The zoomed height of one hour, remembered in this browser (the normal height on the server and in the
 * first render). `ready` is true once the browser's own value is in use, so the first scroll position
 * is worked out with the right height.
 */
function useHourPx(): { hourPx: number; ready: boolean; setHourPx: (px: number) => void } {
  const hourPx = useSyncExternalStore(subscribeHourPx, readHourPx, () => HOUR_PX);
  const ready = useSyncExternalStore(noSubscription, () => true, () => false);
  return { hourPx, ready, setHourPx: saveHourPx };
}

/**
 * The local time "now" (for the red line), refreshed right when the minute changes and when the tab
 * comes back to the front (a hidden tab's timers run late).
 */
function useNowLocal(initial: string, timeZone: string): string {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    let id = 0;
    const tick = () => {
      window.clearTimeout(id);
      setNow(localDateTimeOf(new Date(), timeZone));
      id = window.setTimeout(tick, msToNextMinute(Date.now()));
    };
    const onShow = () => {
      if (document.visibilityState === "visible") tick();
    };
    id = window.setTimeout(tick, msToNextMinute(Date.now()));
    document.addEventListener("visibilitychange", onShow);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [timeZone]);
  return now;
}

/** The small cards over the calendar: "New event", or the series question after a drop. */
type Pop =
  | { kind: "new"; date: string; span: Span; anchor: Anchor }
  | { kind: "series"; event: WeekEvent; start: string; end: string; anchor: Anchor }
  | ({ kind: "overlap" } & OverlapAsk)
  | null;

/** Issue #106: the overlap question. After a drop it knows the move (Move it puts the event back). */
type OverlapAsk = {
  id: string;
  overlap: Overlap;
  anchor: Anchor;
  drop?: { event: WeekEvent; start: string; end: string; saving: Promise<PostResult> };
};

/** The toast at the bottom, as in the prototype: a line and, for 8 seconds, "Undo". */
export type Toast = { id: number; text: string; undo?: () => void };
const TOAST_MS = 8000;

/** The event with this id as the calendar shows it now (timed or all-day), or null. */
function findEvent(week: WeekData, id: string): CalendarEvent | null {
  for (const day of week.days) {
    const found = day.events.find((e) => e.id === id) ?? day.allDay.find((e) => e.id === id);
    if (found) return found;
  }
  return week.lead.find((e) => e.id === id) ?? null;
}

export function CalendarView({
  week: serverWeek,
  nowLocal,
  goals,
  outlookAvailable = false,
  openEventId,
  viewerId = "",
  sharing = NO_PEOPLE,
  showPerson,
}: Props) {
  const week = useLiveWeek(serverWeek);
  const router = useRouter();
  const now = useNowLocal(nowLocal, week.timeZone);
  const today = now.slice(0, 10);
  const isPhone = useMediaQuery(MEDIA.phone);
  const [editor, setEditor] = useState<EditorState>(null);
  const editorRef = useRef<EditorState>(null);
  // Issue #106: whether an event asks about its overlap now (set further down, once the week's events are known).
  const askAfterEditor = useRef<(id: string, changedFrom?: { start: string; end: string }) => boolean>(() => false);
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);
  const [pop, setPop] = useState<Pop>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  // Events whose save is still running: they cannot be dragged again until it is done.
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const { dayStartHour, dayEndHour, timeFormat } = useDisplay();
  const live = useLive();
  const outlookConnected = week.outlook.status === "connected";
  const closePop = useCallback(() => setPop(null), []);
  /**
   * Issue #106: ask about an overlap of this event once the calendar shows it saved. It looks for up to
   * 8 seconds, as the time to leave (the trip) may come a little later. `changedFrom`: the times when
   * the editor opened (left out for a new event).
   */
  const watchOverlap = useCallback((id: string, changedFrom?: { start: string; end: string }) => {
    let tries = 0;
    const look = () => {
      if (askAfterEditor.current(id, changedFrom) || ++tries >= 32) return;
      window.setTimeout(look, 250);
    };
    window.setTimeout(look, 250);
  }, []);
  const closeEditor = useCallback(() => {
    const open = editorRef.current?.mode === "edit" ? editorRef.current.event : null;
    setEditor(null);
    if (open) watchOverlap(open.id, open.allDay ? undefined : { start: open.startLocal, end: open.endLocal });
  }, [watchOverlap]);

  // The toast goes after 8 seconds.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Spec 47: opened from "Next up". The event's block comes into view and its editor opens beside it,
  // as if it had been clicked. An event that is not shown (another day, deleted since) opens nothing.
  useEffect(() => {
    if (!openEventId) return;
    const event = [...week.lead, ...week.days.flatMap((day) => [...day.events, ...day.allDay])].find((e) => e.id === openEventId);
    if (!event) return;
    // After the first paint, when the block has its place on the screen.
    const frame = window.requestAnimationFrame(() => {
      const block = document.querySelector(`[data-event-id="${CSS.escape(openEventId)}"]`);
      if (!block) return;
      block.scrollIntoView({ block: "center" });
      setEditor({ mode: "edit", event, anchor: anchorOf(block) });
    });
    return () => window.cancelAnimationFrame(frame);
    // Only when the page opens for an event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openEventId]);

  const showToast = useCallback((text: string, undo?: () => void) => setToast({ id: Date.now(), text, undo }), []);

  /** After a change of an app event: it goes to Outlook now, and the week re-reads once it is there (R26). */
  const sendToOutlook = useCallback(() => {
    if (outlookConnected) void postJson("/api/outlook/send", {}).then(() => live.refresh());
  }, [outlookConnected, live]);

  const markPending = useCallback((id: string, on: boolean) => {
    setPending((set) => {
      const next = new Set(set);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  /**
   * New times for an event (a drop, or the undo of one): shown at once, saved with edit_event and the
   * updated_at the screen last saw (R4). A refusal puts the block back and shows the server's message.
   */
  const saveTimes = useCallback(
    async (event: WeekEvent, start: string, end: string, updatedAt: string, scope?: Scope): Promise<PostResult> => {
      markPending(event.id, true);
      const answer = await live.run({
        send: () => postJson(`/api/events/${event.id}/edit`, timesBody(event, start, end, updatedAt, scope)),
        optimistic: movedChange(event, start, end, week.timeZone, scope) ?? undefined,
        fromAnswer: savedEventChange,
      });
      markPending(event.id, false);
      if (!answer.ok) showToast(answer.message);
      else sendToOutlook();
      return answer;
    },
    [live, markPending, showToast, sendToOutlook, week.timeZone],
  );

  /** Puts a dropped event back where it was, once its move is saved. */
  const moveBack = useCallback(
    (event: WeekEvent, start: string, end: string, saving: Promise<PostResult>, scope?: Scope) =>
      void saving.then((answer) => {
        const saved = savedEvent(answer);
        if (!answer.ok || !saved) return;
        void saveTimes({ ...event, startLocal: start, endLocal: end }, event.startLocal, event.endLocal, saved.updatedAt, scope);
      }),
    [saveTimes],
  );

  /** A drop: move or resize, with Undo for 8 seconds (the undo edits the event back). */
  const moveEvent = useCallback(
    (event: WeekEvent, start: string, end: string, scope?: Scope) => {
      const saving = saveTimes(event, start, end, event.updatedAt, scope);
      showToast(dropText(event, start, end, timeFormat, scope), () => moveBack(event, start, end, saving, scope));
      return saving;
    },
    [saveTimes, showToast, timeFormat, moveBack],
  );

  // Issue #106: what an event would overlap at new times (set below, once the week's events are known).
  const overlapAt = useRef<(event: WeekEvent, start: string, end: string) => Overlap | null>(() => null);

  const onDrop = useCallback(
    (event: WeekEvent, day: string, span: Span, anchor: Anchor) => {
      const start = localAt(day, span.startMin);
      const end = localAt(day, span.endMin);
      if (start === event.startLocal && end === event.endLocal) return;
      // An event of a series: ask first (R28).
      if (event.seriesId) return setPop({ kind: "series", event, start, end, anchor });
      const saving = moveEvent(event, start, end);
      // Issue #106: it overlaps another event (or its trip does): ask right there.
      const overlap = overlapAt.current(event, start, end);
      if (overlap) setPop({ kind: "overlap", id: event.id, overlap, anchor, drop: { event, start, end, saving } });
    },
    [moveEvent],
  );

  /** Undo of a delete: the same event again (create_event; it gets a new id) with its to-dos, done again if it was. */
  const recreate = useCallback(
    async (event: CalendarEvent, todos: NewTodo[]) => {
      const body = recreateBody(event, todos, now);
      let answer = await live.run({ send: () => postJson("/api/events", body), fromAnswer: savedEventChange });
      // The server may still refuse the guests (Outlook was disconnected meanwhile): bring the event back without them.
      if (isGuestsError(answer)) answer = await live.run({ send: () => postJson("/api/events", withoutGuests(body)), fromAnswer: savedEventChange });
      if (!answer.ok) return showToast(answer.message);
      const saved = savedEvent(answer);
      if (saved && event.status === "done" && !event.allDay) {
        const done = await live.run({ send: () => postJson(`/api/events/${saved.id}/done`, {}), fromAnswer: savedEventChange });
        if (!done.ok) showToast(done.message);
      }
      sendToOutlook();
    },
    [live, showToast, sendToOutlook, now],
  );

  const onDeleted = useCallback(
    (event: CalendarEvent, todos: NewTodo[]) => showToast("Event deleted", () => void recreate(event, todos)),
    [showToast, recreate],
  );

  // Phones have no week view: a week's address shows its day there (as in the prototype).
  const view = coerceView(week.view, isPhone);
  const date = week.date;
  const coerced = view !== week.view;
  const days = useMemo(() => (coerced ? week.days.filter((d) => d.date === date) : week.days), [coerced, week.days, date]);
  const lead = useMemo(() => {
    if (!coerced) return week.lead;
    const i = week.days.findIndex((d) => d.date === date);
    return i > 0 ? leadInto(week.days[i - 1].events, date) : week.lead;
  }, [coerced, week.days, week.lead, date]);

  const placed = useMemo(() => placeWeek(days, lead), [days, lead]);

  // Spec 53: the shared calendars chosen for showing, read for the days the server sent. They stay in
  // their own arrays: nothing below that marks or asks about overlaps ever sees them (R10, R57).
  const shownDates = useMemo(() => week.days.map((d) => d.date), [week.days]);
  const { chosen: shownPeople, toggle: togglePerson, calendars: sharedCalendars } = useSharedCalendars(viewerId, sharing, shownDates, week.timeZone, showPerson);
  const [openShared, setOpenShared] = useState<{ shared: OpenShared; anchor: Anchor } | null>(null);
  const onOpenShared = (item: OpenShared, anchor: Anchor) => setOpenShared({ shared: item, anchor });
  const gridDates = useMemo(() => days.map((d) => d.date), [days]);
  const sharedBlocks = useMemo(() => placeShared(sharedCalendars, gridDates, week.timeZone), [sharedCalendars, gridDates, week.timeZone]);
  const sharedAllDay = useMemo(() => sharedAllDayByDay(sharedCalendars, gridDates), [sharedCalendars, gridDates]);
  const sharedMonth = useMemo(() => {
    if (week.view !== "month" || sharedCalendars.length === 0) return undefined;
    const blocks = placeShared(sharedCalendars, shownDates, week.timeZone);
    const allDay = sharedAllDayByDay(sharedCalendars, shownDates);
    const byDay: Record<string, SharedMonthEntry[]> = {};
    shownDates.forEach((date, i) => {
      byDay[date] = [
        ...allDay[i].map((item) => ({ key: item.key, allDay: item })),
        ...blocks[i]
          .filter((b) => !b.continuesBefore)
          .sort((a, b) => a.startMin - b.startMin)
          .map((block) => ({ key: block.key, block })),
      ];
    });
    return byDay;
  }, [week.view, sharedCalendars, shownDates, week.timeZone]);
  // R27: when to leave for the shown events with a location (dashed blocks before them).
  const shownEvents = useMemo(() => placed.flat().map((b) => b.event), [placed]);
  const travel = useTravelTimes(shownEvents);
  const zoom = useHourPx();
  // Issue #106: the timed events with their times as dates, and when to leave for each one.
  const timed = useMemo<NamedEvent[]>(
    () =>
      [...new Map(shownEvents.filter((e) => !e.allDay).map((e) => [e.id, e])).values()].map((e) => ({
        id: e.id,
        title: e.title,
        startAt: new Date(e.startAt),
        endAt: new Date(e.endAt),
        mayOverlap: e.mayOverlap,
      })),
    [shownEvents],
  );
  const leaveOf = useCallback(
    (id: string) => {
      const answer = travel[id];
      return answer?.status === "ok" ? new Date(answer.leaveAt) : null;
    },
    [travel],
  );
  const tripWarned = useMemo(() => tripConflictIds(timed, leaveOf), [timed, leaveOf]);
  useEffect(() => {
    overlapAt.current = (event, start, end) => {
      const startAt = parseLocalDateTime(start, week.timeZone);
      const endAt = parseLocalDateTime(end, week.timeZone);
      if (!startAt || !endAt) return null;
      // The trip keeps its length: it starts as much earlier as before.
      const leave = leaveOf(event.id);
      const shifted = leave ? new Date(startAt.getTime() - (new Date(event.startAt).getTime() - leave.getTime())) : null;
      return overlapOf({ id: event.id, startAt, endAt, mayOverlap: event.mayOverlap }, timed, shifted, true);
    };
  }, [timed, leaveOf, week.timeZone]);

  // The newest week, for the overlap question's buttons (they act on the event as it is now).
  const weekRef = useRef(week);
  useEffect(() => {
    weekRef.current = week;
  }, [week]);

  /** The event of an overlap question as it is now: after a drop once its move is saved, else from the week. */
  const currentOf = useCallback(
    async (ask: OverlapAsk): Promise<WeekEvent | null> => {
      if (ask.drop) {
        const { event, start, end, saving } = ask.drop;
        const answer = await saving;
        const saved = savedEvent(answer);
        if (!answer.ok || !saved) return null;
        return { ...event, startAt: saved.startAt ?? event.startAt, endAt: saved.endAt ?? event.endAt, startLocal: start, endLocal: end, updatedAt: saved.updatedAt };
      }
      const found = findEvent(weekRef.current, ask.id);
      return found && !found.allDay ? found : null;
    },
    [],
  );

  /** "That's fine": the event may overlap from now on. */
  const acceptOverlap = useCallback(
    async (ask: OverlapAsk) => {
      const event = await currentOf(ask);
      if (!event) return;
      const accepted = await live.run({
        send: () => postJson(`/api/events/${event.id}/edit`, { ...timesBody(event, event.startLocal, event.endLocal, event.updatedAt), mayOverlap: true }),
        fromAnswer: savedEventChange,
      });
      if (!accepted.ok) showToast(accepted.message);
      else sendToOutlook();
    },
    [currentOf, live, showToast, sendToOutlook],
  );

  /** "Discard": the event goes, with Undo in the toast. */
  const discardOverlap = useCallback(
    async (ask: OverlapAsk) => {
      const event = await currentOf(ask);
      if (!event) return;
      const deleted = await live.run({
        send: () => postJson(`/api/events/${event.id}/delete`, { updatedAt: event.updatedAt }),
        fromAnswer: () => ({ week: (w) => withEventChange(w, { removed: event.id }) }),
      });
      if (!deleted.ok) return showToast(deleted.message);
      sendToOutlook();
      onDeleted(event, deletedTodos(deleted));
    },
    [currentOf, live, showToast, sendToOutlook, onDeleted],
  );

  /** "Move it": after a drop the event goes back where it was; else its editor opens to change the time. */
  const moveOverlap = useCallback(
    (ask: OverlapAsk) => {
      if (ask.drop) return moveBack(ask.drop.event, ask.drop.start, ask.drop.end, ask.drop.saving);
      const event = findEvent(weekRef.current, ask.id);
      if (event) setEditor({ mode: "edit", event, anchor: ask.anchor });
    },
    [moveBack],
  );

  /**
   * Back on the calendar after the editor: an event that now overlaps (and was not accepted) asks right
   * there. Its save may still be on its way, so the calendar looks a few times in the next seconds.
   */
  useEffect(() => {
    askAfterEditor.current = (id, changedFrom) => {
      const own = timed.find((e) => e.id === id);
      const shown = shownEvents.find((e) => e.id === id && !e.allDay);
      // A new event, or one whose times changed in the editor: ask again even if it was accepted before.
      const fresh = changedFrom === undefined || (shown !== undefined && (shown.startLocal !== changedFrom.start || shown.endLocal !== changedFrom.end));
      const overlap = own ? overlapOf(own, timed, leaveOf(id), fresh) : null;
      if (!overlap) return false;
      const block = document.querySelector(`[data-event-id="${id}"]`);
      if (!block) return false;
      setPop({ kind: "overlap", id, overlap, anchor: anchorOf(block) });
      return true;
    };
  }, [timed, leaveOf, shownEvents]);

  const range = useMemo(
    () => ({ ...gridRange(placed, { startMin: dayStartHour * 60, endMin: dayEndHour * 60 }), hourPx: zoom.hourPx }),
    [placed, dayStartHour, dayEndHour, zoom.hourPx],
  );
  const todayShown = days.some((d) => d.date === today);
  const nowMin = todayShown ? minuteOfLocal(now) : null;

  // Where the buttons go: the server's previous and next for the address's view; a phone's day steps by a day.
  const previous = coerced ? stepDate(view, date, -1) : week.previous;
  const next = coerced ? stepDate(view, date, 1) : week.next;

  // The scroll position starts again when the view or its days change: now (or the first event) in view.
  const scrollKey = `${view}:${days[0]?.date}`;
  const scrolledFor = useRef<string | null>(null);
  useEffect(() => {
    if (view === "month" || !zoom.ready || scrolledFor.current === scrollKey) return;
    scrolledFor.current = scrollKey;
    const grid = document.querySelector<HTMLElement>("[data-grid-scroll]");
    if (!grid) return;
    const starts = placed.flat().filter((b) => !b.continuesBefore).map((b) => b.startMin);
    const target = nowMin !== null ? nowMin - SCROLL_CONTEXT_MIN : starts.length > 0 ? Math.min(...starts) - SCROLL_LEAD_MIN : range.startMin;
    // Snapped to a full hour, so its line is not cut off.
    grid.scrollTop = Math.max(0, minuteToPx(Math.floor(target / 60) * 60, range));
  }, [view, scrollKey, placed, nowMin, range, zoom.ready]);

  // Keyboard shortcuts as in the prototype: D, W, M for the views, T for today, ← → to step.
  // Never while typing in a field, in a side column, or while a dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTypingTarget(e.target)) return;
      if (e.target instanceof Element && e.target.closest("aside")) return;
      if (document.querySelector('[role="dialog"],[aria-modal="true"],dialog[open]')) return;
      const action = shortcutFor(e);
      if (!action || (e.repeat && action.type !== "step")) return;
      if (action.type === "view" && !allowedViews(isPhone).includes(action.view)) return;
      e.preventDefault();
      if (action.type === "view") router.push(calendarHref(action.view, date));
      else if (action.type === "today") router.push(calendarHref(view));
      else router.push(calendarHref(view, action.dir < 0 ? previous : next));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, view, date, previous, next, isPhone]);

  // "New event" without a click in the grid (also by keyboard), as in the prototype: the small card at
  // the button, on the day the calendar is on (the day in the address): the next full hour when that
  // day is today, else 9am. In a week or month it is the chosen day, not simply today.
  const addEvent = (anchor: Anchor) => {
    // The next full hour on the user's own clock at the moment of the click, not a value the server worked out earlier.
    setPop({ kind: "new", ...newEventSlot({ date, today, nextHour: nextFullHour(localDateTimeOf(new Date(), week.timeZone)), dayStartHour }), anchor });
  };

  const title = viewTitle(view, date);
  const subtitle = viewSubtitle(view, date);
  const dayHref = (day: string) => calendarHref("day", day);

  return (
    <>
      <section
        aria-label="Calendar"
        className="@container flex h-[calc(100dvh-7rem)] min-h-[480px] min-w-0 flex-col gap-3 px-4 pt-4 pb-3 md:h-dvh md:px-6 md:pt-6 md:pb-5"
      >
        <header className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            {/* flex-1: the title gets the free room. */}
            <div className="min-w-0 flex-1">
              <DateJumpTitle title={title} valueKey={date} todayKey={today} onPick={(day) => router.push(calendarHref(view, day))} />
              {subtitle && (
                <p className="mt-0.5 truncate text-xs text-ink-2 @xl:text-sm">
                  {/* A narrow column (phones): the short line, so nothing breaks mid-word. */}
                  <span className="@max-md:hidden">{subtitle}</span>
                  <span className="@md:hidden">{viewSubtitleShort(view, date)}</span>
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <div className="hidden md:block">
                <OutlookChip outlook={week.outlook} available={outlookAvailable} timeZone={week.timeZone} today={today} />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <LinkButton href={calendarHref(view, previous)} variant="secondary" size="icon" aria-label={navLabel(view, -1)} title={`${navLabel(view, -1)} (←)`}>
                <ChevronLeft className="size-4" strokeWidth={2} />
              </LinkButton>
              <LinkButton href={calendarHref(view, next)} variant="secondary" size="icon" aria-label={navLabel(view, 1)} title={`${navLabel(view, 1)} (→)`}>
                <ChevronRight className="size-4" strokeWidth={2} />
              </LinkButton>
            </div>
            <LinkButton href={calendarHref(view)} variant="secondary" title="Today (T)" aria-current={todayShown ? "date" : undefined}>
              Today
            </LinkButton>
            <ViewSwitch views={allowedViews(isPhone)} view={view} date={date} />
            <div className="ml-auto flex items-center gap-2">
              <SharedPeopleButton people={sharing} chosen={shownPeople} onToggle={togglePerson} />
              <Button variant="secondary" size="icon" aria-label="New event" title="New event" className="@3xl:w-auto @3xl:px-4" onClick={(e) => addEvent(anchorOf(e.currentTarget))}>
                <Plus className="size-4" strokeWidth={2} />
                <span className="hidden @3xl:inline">New event</span>
              </Button>
            </div>
          </div>
        </header>

        {/* The day view's strip; on a phone a week's address shows its day, so the strip is there too. */}
        {(view === "day" || week.view === "week") && (
          <DayStrip date={date} today={today} className="md:hidden" />
        )}

        <div className="relative min-h-0 flex-1">
          {view === "month" ? (
            <MonthView
              days={week.days}
              lead={week.lead}
              month={date.slice(0, 7)}
              goals={goals}
              dayHref={dayHref}
              onOpenDay={(day) => router.push(dayHref(day))}
              onOpenEvent={(event, anchor) => setEditor({ mode: "edit", event, anchor })}
              shared={sharedMonth}
              timeZone={week.timeZone}
              onOpenShared={onOpenShared}
            />
          ) : (
            <TimeGrid
              days={days}
              placed={placed}
              range={range}
              nowMin={nowMin}
              selectedDay={date}
              dayHref={view === "week" || !coerced ? dayHref : undefined}
              weekDates={view === "day" && !coerced ? visibleDays("week", date) : undefined}
              weekAllDay={view === "day" && !coerced ? week.weekAllDay : undefined}
              today={today}
              goals={goals}
              pending={pending}
              onOpenEvent={(event, anchor) => setEditor({ mode: "edit", event, anchor })}
              onCreate={(day, span, anchor) => setPop({ kind: "new", date: day, span, anchor })}
              onDrop={onDrop}
              travel={travel}
              tripWarned={tripWarned}
              onCreateAllDay={(day, anchor) => {
                setPop(null);
                setEditor({ mode: "create", start: `${day}T09:00`, end: `${day}T10:00`, allDay: true, anchor });
              }}
              onZoom={zoom.setHourPx}
              shared={sharedCalendars.length > 0 ? sharedBlocks : undefined}
              sharedAllDay={sharedCalendars.length > 0 ? sharedAllDay : undefined}
              timeZone={week.timeZone}
              onOpenShared={onOpenShared}
            />
          )}
        </div>
      </section>
      <EventEditor
        state={editor}
        shown={editor?.mode === "edit" ? findEvent(week, editor.event.id) : null}
        goals={goals}
        timeZone={week.timeZone}
        today={today}
        outlookConnected={outlookConnected}
        onClose={closeEditor}
        onDeleted={onDeleted}
        onRefused={showToast}
        onCreated={(event) => setEditor((current) => (current ? { mode: "edit", event, anchor: current.anchor } : null))}
      />
      {pop?.kind === "new" && (
        <NewEventPopover
          key={`${pop.date}-${pop.span.startMin}-${pop.span.endMin}`}
          date={pop.date}
          today={today}
          startMin={pop.span.startMin}
          endMin={pop.span.endMin}
          anchor={pop.anchor}
          goals={goals}
          outlookConnected={outlookConnected}
          onClose={closePop}
          onCreated={(id) => watchOverlap(id)}
          onOpenEditor={(draft) => {
            setPop(null);
            setEditor({ mode: "create", ...draft, anchor: pop.anchor });
          }}
        />
      )}
      {pop?.kind === "series" && (
        <FloatingPanel anchor={pop.anchor} label={`Save changes to '${pop.event.title}'?`} width={320} onClose={closePop}>
          <div className="flex flex-wrap items-center gap-2 p-4">
            <SeriesQuestion
              kind="save"
              title={pop.event.title}
              busy={false}
              onAnswer={(scope) => {
                setPop(null);
                moveEvent(pop.event, pop.start, pop.end, scope);
              }}
              onCancel={closePop}
            />
          </div>
        </FloatingPanel>
      )}
      {pop?.kind === "overlap" && (
        <FloatingPanel anchor={pop.anchor} label="This event overlaps another one" width={320} onClose={closePop}>
          <OverlapNotice
            overlap={pop.overlap}
            timeZone={week.timeZone}
            onFine={() => {
              setPop(null);
              void acceptOverlap(pop);
            }}
            onMove={() => {
              setPop(null);
              if (pop.drop) setToast(null);
              moveOverlap(pop);
            }}
            onDiscard={() => {
              setPop(null);
              void discardOverlap(pop);
            }}
          />
        </FloatingPanel>
      )}
      {openShared && <SharedEventCard shared={openShared.shared} anchor={openShared.anchor} onClose={() => setOpenShared(null)} />}
      {toast && <ToastBar key={toast.id} toast={toast} onDone={() => setToast(null)} />}
    </>
  );
}

/** Day | Week | Month on a grey pill, as in the prototype; each a link that keeps the day. */
function ViewSwitch({ views, view, date }: { views: View[]; view: View; date: string }) {
  return (
    <nav aria-label="View" className="inline-flex h-9 items-center rounded-full bg-raised p-0.5">
      {views.map((v) => (
        <Link
          key={v}
          href={calendarHref(v, date)}
          aria-current={view === v ? "page" : undefined}
          title={`${viewLabel(v)} (${viewLabel(v)[0]})`}
          // Phones have no week view; hidden by a class too, so the first paint from the server fits.
          className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 ${
            view === v ? "border-line-subtle bg-surface text-ink" : "border-transparent text-ink-2 hover:text-ink"
          } ${v === "week" ? "max-md:hidden" : ""}`}
        >
          {viewLabel(v)}
        </Link>
      ))}
    </nav>
  );
}

/** The day view's week strip, to change the day quickly (as in the prototype). */
function DayStrip({ date, today, className }: { date: string; today: string; className: string }) {
  return (
    <nav aria-label="Days of the week" className={`grid grid-cols-7 gap-1 rounded-card border border-line-subtle bg-surface p-1 ${className}`}>
      {visibleDays("week", date).map((key) => {
        const isToday = key === today;
        const selected = key === date;
        return (
          <Link
            key={key}
            href={calendarHref("day", key)}
            aria-label={`${fmtDateLong(key)}${isToday ? ", today" : ""}`}
            aria-current={selected ? "date" : undefined}
            className="flex min-w-0 flex-col items-center gap-0.5 rounded-lg py-1 transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
          >
            <span className="text-[11px] font-medium text-ink-3">{fmtWeekday(key)}</span>
            <span
              className={`flex size-8 items-center justify-center rounded-full border text-sm font-semibold tabular ${
                isToday ? "border-transparent bg-today text-white" : selected ? "border-ink text-ink" : "border-transparent text-ink"
              }`}
            >
              {Number(key.slice(8, 10))}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

/** The short note at the bottom (for example "Event deleted · Undo"), as in the prototype. Read out when it appears. */
export function ToastBar({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-32 z-[55] flex justify-center px-4 md:bottom-6">
      <div role="status" className="pointer-events-auto flex max-w-full items-center gap-3 rounded-full bg-ink py-2 pr-2 pl-4 text-sm text-white shadow-float">
        <span className="min-w-0 truncate">{toast.text}</span>
        {toast.undo ? (
          <button
            type="button"
            onClick={() => {
              toast.undo?.();
              onDone();
            }}
            className="shrink-0 rounded-full px-2.5 py-1 font-semibold text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            Undo
          </button>
        ) : (
          <span className="w-1" />
        )}
      </div>
    </div>
  );
}
