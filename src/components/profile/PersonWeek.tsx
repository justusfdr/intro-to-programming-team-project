"use client";

// "<name>'s week" on a person's profile page (spec 53, from spec 33, as a list: "Option B" of the port
// plan). Their shared calendar for one week, read only, as seven days in a list, in THEIR time zone,
// which is named. Free/busy entries say "Busy"; details entries show title and place and open the small
// read-only card. Nothing can be dragged, created or opened in the editor, and the calendar's own grid is
// not used. Previous and next move by a week. The events are read from the same address as the
// calendar's shared blocks (GET /api/shares/[id]/calendar) and kept to the same allow-list (asAnswer),
// so the server and the database decide everything (R56, R57); nothing is remembered.
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { anchorOf, type Anchor } from "@/components/calendar/FloatingPanel";
import { SHARED_STRIPES, SharedEventCard, allDayWhen, sharedWhen, type OpenShared } from "@/components/calendar/Shared";
import { asAnswer } from "@/components/calendar/useSharedCalendars";
import { useDisplay } from "@/components/shell/DisplayProvider";
import { Button } from "@/components/ui/Button";
import { getJson } from "@/lib/client/post-json";
import { placeShared, sharedAllDayByDay, windowOf, type SharedAllDayItem, type SharedBlock } from "@/lib/shares/place";
import type { SharedCalendarAnswer, SharingPerson } from "@/lib/shares/types";
import { fmtDateLong, fmtRange, fmtTime, fmtWeekRange, type TimeFormat } from "@/lib/time/display";
import { addDays, localDateOf, mondayOf } from "@/lib/time/zoned";

/** "Shows free/busy only" or "Shows details". */
export const levelNote = (level: "busy" | "details") => (level === "busy" ? "Shows free/busy only" : "Shows details");

/** "9 – 11am", or "… – 1am" / "11pm – …" for the parts of an event past midnight. */
function blockTime(block: SharedBlock, format: TimeFormat): string {
  if (!block.continuesBefore && !block.continuesAfter) return fmtRange(block.startMin, block.endMin, format);
  return `${block.continuesBefore ? "…" : fmtTime(block.startMin, format)} – ${block.continuesAfter ? "…" : fmtTime(block.endMin, format)}`;
}

const ROW_CLASS = "flex w-full min-w-0 items-baseline gap-3 rounded-lg border border-dashed border-ink-3/60 bg-surface px-2.5 py-1.5 text-left text-sm text-ink-2";

/** One entry of a day: the time (or "All day") and "Busy" or the title and place. A details entry opens the card. */
function Entry({ time, title, location, open }: { time: string; title: string; location: string | null; open?: (anchor: Anchor) => void }) {
  const inner = (
    <>
      <span className="w-[7.5rem] shrink-0 text-xs tabular text-ink-3">{time}</span>
      <span className="min-w-0 flex-1 truncate text-ink">{title}</span>
      {location && <span className="hidden min-w-0 max-w-[40%] truncate text-xs text-ink-3 sm:inline">{location}</span>}
    </>
  );
  if (!open) {
    return (
      <div style={SHARED_STRIPES} className={ROW_CLASS}>
        {inner}
      </div>
    );
  }
  return (
    <button
      type="button"
      style={SHARED_STRIPES}
      onClick={(e) => open(anchorOf(e.currentTarget))}
      className={`${ROW_CLASS} hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40`}
    >
      {inner}
    </button>
  );
}

/**
 * The seven days as a list (no fetching here): each day with its all-day entries, then its timed ones in
 * time order, or "Free". Exported for the previews and tests.
 */
export function WeekList({
  person,
  dates,
  today,
  timeZone,
  allDay,
  blocks,
  onOpen,
}: {
  person: SharingPerson;
  dates: readonly string[];
  today: string;
  timeZone: string;
  allDay: SharedAllDayItem[][];
  blocks: SharedBlock[][];
  onOpen: (shared: OpenShared, anchor: Anchor) => void;
}) {
  const { timeFormat } = useDisplay();
  const empty = allDay.every((list) => list.length === 0) && blocks.every((list) => list.length === 0);
  return (
    <div className="flex flex-col gap-2">
      {empty && <p className="text-sm text-ink-3">Nothing in {person.name}&apos;s calendar this week.</p>}
      <ol aria-label={`${person.name}'s week`} className="flex flex-col divide-y divide-line-subtle">
        {dates.map((date, i) => {
          const items = allDay[i] ?? [];
          const timed = [...(blocks[i] ?? [])].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
          return (
            <li key={date} className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:gap-4">
              <h3 className={`w-40 shrink-0 text-sm font-medium ${date === today ? "text-today" : "text-ink"}`}>
                {fmtDateLong(date)}
                {date === today && <span className="sr-only">, today</span>}
              </h3>
              {items.length === 0 && timed.length === 0 ? (
                <p className="text-sm text-ink-3">Free</p>
              ) : (
                <ul className="flex min-w-0 flex-1 flex-col gap-1">
                  {items.map((item) => {
                    const details = item.level === "details";
                    const title = details ? item.event.title || "Busy" : "Busy";
                    const location = details ? (item.event.location ?? null) : null;
                    return (
                      <li key={item.key}>
                        <Entry
                          time="All day"
                          title={title}
                          location={location}
                          open={details ? (anchor) => onOpen({ person, title, location, when: allDayWhen(item.event.firstDay, item.event.lastDay) }, anchor) : undefined}
                        />
                      </li>
                    );
                  })}
                  {timed.map((block) => {
                    const details = block.level === "details";
                    const title = details ? block.title || "Busy" : "Busy";
                    const location = details ? block.location : null;
                    return (
                      <li key={`${block.key}-${block.continuesBefore ? "after" : "start"}`}>
                        <Entry
                          time={blockTime(block, timeFormat)}
                          title={title}
                          location={location}
                          open={details ? (anchor) => onOpen({ person, title, location, when: sharedWhen(block.startAt, block.endAt, timeZone, timeFormat) }, anchor) : undefined}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function PersonWeek({ person, timeZone, now }: { person: SharingPerson; timeZone: string; now: string }) {
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

  const ready = answer?.monday === monday;
  const data = ready ? answer.data : null;
  const level = data?.level ?? (person.calendar === "details" ? "details" : "busy");
  const calendars = useMemo(() => (data ? [{ person, level: data.level, events: data.events }] : []), [data, person]);
  const blocks = useMemo(() => placeShared(calendars, dates, timeZone), [calendars, dates, timeZone]);
  const allDay = useMemo(() => sharedAllDayByDay(calendars, dates), [calendars, dates]);
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
      {!ready ? (
        <p className="text-sm text-ink-3">Loading…</p>
      ) : !data ? (
        // A withdrawn share or a removed contact: the server says "Not found" like for anyone else.
        <p className="text-sm text-ink-2">{answer.message || "This calendar is not available."}</p>
      ) : (
        <WeekList person={person} dates={dates} today={today} timeZone={timeZone} allDay={allDay} blocks={blocks} onOpen={(shared, anchor) => setOpen({ shared, anchor })} />
      )}
      {open && <SharedEventCard shared={open.shared} anchor={open.anchor} onClose={() => setOpen(null)} />}
    </div>
  );
}
