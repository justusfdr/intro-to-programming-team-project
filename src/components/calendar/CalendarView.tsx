"use client";

// The calendar screen in the prototype's layout: the title (month and year) with the week below it,
// the toolbar (previous, next, Today, New event), on phones a day strip, then the time grid.
// The data comes from the server (src/app/page.tsx); after an action the editor calls
// router.refresh(), which loads the week again.
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, LinkButton } from "@/components/ui/Button";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { formatMinute, gridRange, minuteOfLocal, minuteToPx, placeWeek } from "@/lib/events/grid";
import type { WeekData } from "@/lib/events/types";
import type { GoalLabel } from "./TimeGrid";
import { addDays, dayParts, isoWeekNumber, localDateTimeOf, weekTitle } from "@/lib/time/zoned";
import { fmtDateLong, fmtWeekRange } from "@/lib/time/display";
import { useDisplay } from "@/components/shell/DisplayProvider";
import { GoalsToggle } from "@/components/goals/GoalsPanel";
import { EventEditor, type EditorState } from "./EventEditor";
import { OutlookChip } from "./OutlookChip";
import { TimeGrid } from "./TimeGrid";

type Props = {
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

export function CalendarView({ week, nowLocal, suggestion, goals, outlookAvailable = false }: Props) {
  const now = useNowLocal(nowLocal, week.timeZone);
  const today = now.slice(0, 10);
  const todayInWeek = week.days.some((d) => d.date === today);
  const [selectedDay, setSelectedDay] = useState(todayInWeek ? today : week.monday);
  const [editor, setEditor] = useState<EditorState>(null);
  const scrollStarted = useRef(false);

  const { dayStartHour, dayEndHour } = useDisplay();
  const placed = useMemo(() => placeWeek(week.days), [week.days]);
  const range = useMemo(
    () => gridRange(placed, { startMin: dayStartHour * 60, endMin: dayEndHour * 60 }),
    [placed, dayStartHour, dayEndHour],
  );
  const nowMin = todayInWeek ? minuteOfLocal(now) : null;

  // Once, on opening: scroll the grid so the current time (or the first event) is in view.
  useEffect(() => {
    if (scrollStarted.current) return;
    scrollStarted.current = true;
    const grid = document.querySelector<HTMLElement>("[data-grid-scroll]");
    const first = placed.flat().map((b) => b.startMin);
    const target = nowMin ?? (first.length > 0 ? Math.min(...first) : range.startMin);
    // An hour and a half of lead time, snapped to a full hour so its line is not cut off.
    if (grid) grid.scrollTop = Math.max(0, minuteToPx(Math.floor((target - 90) / 60) * 60, range));
  }, [placed, nowMin, range]);

  return (
    <>
      <div className="flex h-[calc(100dvh-7rem)] min-h-[480px] flex-col gap-3 px-4 pt-4 pb-3 md:h-dvh md:px-6 md:pt-6 md:pb-5">
        <header className="flex flex-col gap-3">
          <div>
            <h1 className="text-[26px] leading-[32px] font-semibold tracking-display text-ink md:text-[32px] md:leading-[38px]">
              {weekTitle(week.monday)}
            </h1>
            <p className="mt-0.5 text-xs text-ink-2 md:text-sm">
              Week {isoWeekNumber(week.monday)} · {fmtWeekRange(week.monday)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <LinkButton href={`/?week=${week.previous}`} variant="secondary" size="icon" aria-label="Previous week" title="Previous week">
                <ChevronLeft className="size-4" />
              </LinkButton>
              <LinkButton href={`/?week=${week.next}`} variant="secondary" size="icon" aria-label="Next week" title="Next week">
                <ChevronRight className="size-4" />
              </LinkButton>
            </div>
            <LinkButton
              href={`/?week=${week.thisWeek}`}
              variant="secondary"
              aria-current={week.monday === week.thisWeek ? "page" : undefined}
            >
              Today
            </LinkButton>
            <GoalsToggle />
            <div className="hidden md:block">
              <OutlookChip outlook={week.outlook} available={outlookAvailable} timeZone={week.timeZone} today={today} />
            </div>
            <Button className="ml-auto" onClick={() => setEditor({ mode: "create", ...suggestion })}>
              <Plus className="size-4" />
              New event
            </Button>
          </div>
        </header>

        {/* Phones show one day at a time; this strip picks it. */}
        <div role="group" aria-label="Day" className="grid grid-cols-7 gap-1 rounded-card border border-line-subtle bg-surface p-1 md:hidden">
          {week.days.map((day) => {
            const parts = dayParts(day.date);
            const selected = day.date === selectedDay;
            return (
              <button
                key={day.date}
                type="button"
                onClick={() => setSelectedDay(day.date)}
                aria-label={`${fmtDateLong(day.date)}${day.isToday ? ", today" : ""}`}
                aria-pressed={selected}
                className="flex min-w-0 flex-col items-center gap-0.5 rounded-lg py-1 transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
              >
                <span className="text-[11px] font-medium text-ink-3">{parts.weekday}</span>
                <span
                  className={`flex size-8 items-center justify-center rounded-full border text-sm font-semibold tabular ${
                    day.isToday ? "border-transparent bg-today text-white" : selected ? "border-ink text-ink" : "border-transparent text-ink"
                  }`}
                >
                  {parts.day}
                </span>
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1">
          <TimeGrid
            days={week.days}
            placed={placed}
            range={range}
            nowMin={nowMin}
            selectedDay={selectedDay}
            goals={goals}
            onOpenEvent={(event) => setEditor({ mode: "edit", event })}
            onCreateAt={(date, slot) => setEditor({ mode: "create", start: localAt(date, slot.startMin), end: localAt(date, slot.endMin) })}
          />
        </div>
      </div>
      <EventEditor state={editor} goals={goals} outlookConnected={week.outlook.status === "connected"} onClose={() => setEditor(null)} />
    </>
  );
}
