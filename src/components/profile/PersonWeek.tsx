"use client";

// "<name>'s week" on a person's profile page (spec 33): their shared calendar for one week, read only, in
// the calendar's own week grid (TimeGrid in its read-only mode), in THEIR time zone, which is named.
// Free/busy blocks say "Busy"; details blocks show title and place and open the small read-only card.
// Nothing can be dragged, created or opened in the editor. Previous and next move by a week. The events
// are read from the same address as the calendar's shared blocks (GET /api/shares/[id]/calendar), so the
// server and the database decide everything (R48); nothing is remembered.
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { asAnswer } from "@/components/calendar/useSharedCalendars";
import { type Anchor } from "@/components/calendar/FloatingPanel";
import { SharedEventCard, type OpenShared } from "@/components/calendar/Shared";
import { TimeGrid } from "@/components/calendar/TimeGrid";
import { useDisplay } from "@/components/shell/DisplayProvider";
import { Button } from "@/components/ui/Button";
import { getJson } from "@/lib/client/post-json";
import type { WeekDay } from "@/lib/events/types";
import { placeShared, sharedAllDayByDay, windowOf } from "@/lib/shares/place";
import type { SharedCalendarAnswer, SharingPerson } from "@/lib/shares/types";
import { fmtWeekRange } from "@/lib/time/display";
import { addDays, dayLabel, localDateOf, localTimeOf, mondayOf } from "@/lib/time/zoned";

const NO_EVENTS: never[] = [];

/** "Shows free/busy only" or "Shows details". */
export const levelNote = (level: "busy" | "details") => (level === "busy" ? "Shows free/busy only" : "Shows details");

export function PersonWeek({ person, timeZone, now }: { person: SharingPerson; timeZone: string; now: string }) {
  const { dayStartHour, dayEndHour } = useDisplay();
  const today = localDateOf(new Date(now), timeZone);
  const [monday, setMonday] = useState(() => mondayOf(today));
  const [answer, setAnswer] = useState<{ monday: string; data: SharedCalendarAnswer | null; message: string } | null>(null);
  const [open, setOpen] = useState<{ shared: OpenShared; anchor: Anchor } | null>(null);
  const dates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);

  useEffect(() => {
    let cancelled = false;
    const { from, to } = windowOf(dates, timeZone);
    void getJson(`/api/shares/${encodeURIComponent(person.userId)}/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).then((read) => {
      if (!cancelled) setAnswer({ monday: dates[0], data: read.ok ? asAnswer(read.data) : null, message: read.ok ? "" : read.message });
    });
    return () => {
      cancelled = true;
    };
  }, [dates, person.userId, timeZone]);

  const data = answer?.monday === monday ? answer.data : null;
  const level = data?.level ?? (person.calendar === "details" ? "details" : "busy");
  const calendars = useMemo(() => (data ? [{ person, level: data.level, events: data.events }] : []), [data, person]);
  const shared = useMemo(() => placeShared(calendars, dates, timeZone), [calendars, dates, timeZone]);
  const sharedAllDay = useMemo(() => sharedAllDayByDay(calendars, dates), [calendars, dates]);
  const days: WeekDay[] = dates.map((date) => ({ date, label: dayLabel(date), isToday: date === today, events: NO_EVENTS, allDay: NO_EVENTS }));
  const placed = dates.map(() => NO_EVENTS);
  // The settings' visible hours, widened to whole hours around every block of this week.
  const blocks = shared.flat();
  const range = {
    startMin: Math.min(dayStartHour * 60, ...blocks.map((b) => Math.floor(b.startMin / 60) * 60)),
    endMin: Math.max(dayEndHour * 60, ...blocks.map((b) => Math.ceil(b.endMin / 60) * 60)),
  };
  const nowLocal = localTimeOf(new Date(now), timeZone);
  const nowMin = dates.includes(today) ? Number(nowLocal.slice(0, 2)) * 60 + Number(nowLocal.slice(3, 5)) : null;
  const zone = timeZone.replaceAll("_", " ");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="min-w-0 flex-1 text-xs text-ink-3">
          {levelNote(level)} · Times in {zone}, their time zone
        </p>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Previous week" onClick={() => setMonday(addDays(monday, -7))}>
            <ChevronLeft className="size-4" strokeWidth={2} />
          </Button>
          <span className="min-w-[7.5rem] text-center text-sm font-medium text-ink tabular" aria-live="polite">
            {fmtWeekRange(monday)}
          </span>
          <Button variant="ghost" size="icon" aria-label="Next week" onClick={() => setMonday(addDays(monday, 7))}>
            <ChevronRight className="size-4" strokeWidth={2} />
          </Button>
        </div>
      </div>
      {answer?.monday === monday && !data ? (
        <p className="text-sm text-ink-2">{answer.message || "This calendar is not available."}</p>
      ) : (
        // The week keeps its width on phones and scrolls sideways.
        <div className="scroll-thin overflow-x-auto">
          <div className="h-[440px] min-w-[640px]">
            <TimeGrid
              goals={[]}
              days={days}
              placed={placed}
              range={range}
              nowMin={nowMin}
              selectedDay={today}
              readOnly
              onOpenEvent={() => {}}
              shared={shared}
              sharedAllDay={sharedAllDay}
              timeZone={timeZone}
              onOpenShared={(item, anchor) => setOpen({ shared: item, anchor })}
            />
          </div>
        </div>
      )}
      {open && <SharedEventCard shared={open.shared} anchor={open.anchor} onClose={() => setOpen(null)} />}
    </div>
  );
}
