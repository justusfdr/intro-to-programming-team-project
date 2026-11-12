"use client";

// The calendar screen in the prototype's layout (its components/calendar/CalendarScreen.tsx): the title
// (month and year, opens a month calendar to jump to a day) with the view's line below it, the toolbar
// (goals, previous, next, Today, Day | Week | Month, "+" for a new event), on the day view the day
// strip, then the time grid or the month grid. Left out as decided: plan week, plan strength, the coach.
// Which view and which day live in the address (/?view=day&date=2026-11-18), so reload and back work;
// the page reads exactly those days on the server (src/app/page.tsx). Phones get day and month only.
// An action's change shows at once and the days are read again in the background (components/live/Live.tsx).
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/Button";
import { formatMinute, gridRange, minuteOfLocal, minuteToPx, placeWeek } from "@/lib/events/grid";
import type { WeekData } from "@/lib/events/types";
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
import { leadInto } from "@/lib/events/week-view";
import { fmtDateLong, fmtWeekday } from "@/lib/time/display";
import { addDays, localDateTimeOf } from "@/lib/time/zoned";
import { useDisplay } from "@/components/shell/DisplayProvider";
import { useLiveWeek } from "@/components/live/Live";
import { GoalsToggle } from "@/components/goals/GoalsPanel";
import { DateJumpTitle } from "./DateJump";
import { EventEditor, type EditorState } from "./EventEditor";
import { MonthView } from "./MonthView";
import { OutlookChip } from "./OutlookChip";
import { TimeGrid, type GoalLabel } from "./TimeGrid";
import { MEDIA, useMediaQuery } from "./useMedia";

type Props = {
  /** The shown days (one, a week or the month's 42), with the view and day of the address. */
  week: WeekData;
  /** The current local time from the server, "2026-11-16T09:12", so the first render matches it. */
  nowLocal: string;
  /** Start and end the "New event" button suggests (the next full hour). */
  suggestion: { start: string; end: string };
  /** The user's goals, for the colour and name of an event's goal. */
  goals: GoalLabel[];
  /** Outlook is set up on this server. */
  outlookAvailable?: boolean;
};

/** Minutes of lead time above "now" when today is shown, and above the earliest event otherwise. */
const SCROLL_CONTEXT_MIN = 90;
const SCROLL_LEAD_MIN = 30;

/** The local time "now", refreshed every minute (for the red line). */
function useNowLocal(initial: string, timeZone: string): string {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    const id = window.setInterval(() => setNow(localDateTimeOf(new Date(), timeZone)), 60_000);
    return () => window.clearInterval(id);
  }, [timeZone]);
  return now;
}

/** "YYYY-MM-DDTHH:MM" for minute `min` of `date`; 24:00 becomes 00:00 of the next day. */
function localAt(date: string, min: number): string {
  return min >= 24 * 60 ? `${addDays(date, 1)}T00:00` : `${date}T${formatMinute(min)}`;
}

export function CalendarView({ week: serverWeek, nowLocal, suggestion, goals, outlookAvailable = false }: Props) {
  const week = useLiveWeek(serverWeek);
  const router = useRouter();
  const now = useNowLocal(nowLocal, week.timeZone);
  const today = now.slice(0, 10);
  const isPhone = useMediaQuery(MEDIA.phone);
  const [editor, setEditor] = useState<EditorState>(null);
  const { dayStartHour, dayEndHour } = useDisplay();

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
  const range = useMemo(
    () => gridRange(placed, { startMin: dayStartHour * 60, endMin: dayEndHour * 60 }),
    [placed, dayStartHour, dayEndHour],
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
    if (view === "month" || scrolledFor.current === scrollKey) return;
    scrolledFor.current = scrollKey;
    const grid = document.querySelector<HTMLElement>("[data-grid-scroll]");
    if (!grid) return;
    const starts = placed.flat().filter((b) => !b.continuesBefore).map((b) => b.startMin);
    const target = nowMin !== null ? nowMin - SCROLL_CONTEXT_MIN : starts.length > 0 ? Math.min(...starts) - SCROLL_LEAD_MIN : range.startMin;
    // Snapped to a full hour, so its line is not cut off.
    grid.scrollTop = Math.max(0, minuteToPx(Math.floor(target / 60) * 60, range));
  }, [view, scrollKey, placed, nowMin, range]);

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

  // "New event" without a click in the grid: the next full hour today, else 9am on the shown day.
  const addEvent = () => {
    if (todayShown || view === "month") {
      setEditor({ mode: "create", ...suggestion });
      return;
    }
    const startMin = Math.max(dayStartHour * 60, 9 * 60);
    setEditor({ mode: "create", start: localAt(date, startMin), end: localAt(date, Math.min(24 * 60, startMin + 60)) });
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
            <GoalsToggle />
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
              <Button variant="secondary" size="icon" aria-label="New event" title="New event" className="@3xl:w-auto @3xl:px-4" onClick={addEvent}>
                <Plus className="size-4" strokeWidth={2} />
                <span className="hidden @3xl:inline">New event</span>
              </Button>
            </div>
          </div>
        </header>

        {/* The day view's strip; on a phone a week's address shows its day, so the strip is there too. */}
        {(view === "day" || week.view === "week") && (
          <DayStrip date={date} today={today} className={view === "day" ? "" : "md:hidden"} />
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
              onOpenEvent={(event) => setEditor({ mode: "edit", event })}
            />
          ) : (
            <TimeGrid
              days={days}
              placed={placed}
              range={range}
              nowMin={nowMin}
              selectedDay={date}
              dayHref={view === "week" ? dayHref : undefined}
              goals={goals}
              onOpenEvent={(event) => setEditor({ mode: "edit", event })}
              onCreateAt={(day, slot) => setEditor({ mode: "create", start: localAt(day, slot.startMin), end: localAt(day, slot.endMin) })}
            />
          )}
        </div>
      </section>
      <EventEditor state={editor} goals={goals} outlookConnected={week.outlook.status === "connected"} onClose={() => setEditor(null)} />
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
          className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 ${
            view === v ? "border-line-subtle bg-surface text-ink" : "border-transparent text-ink-2 hover:text-ink"
          }`}
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
