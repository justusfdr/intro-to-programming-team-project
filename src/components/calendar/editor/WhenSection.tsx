"use client";

// WHEN, as in the prototype: the date button with its month calendar, then start and end (the end
// also shows the length). Ours in the same style: the all-day switch next to the heading (not for an
// event of a series, R29), first and last day for an all-day event, and the repeat choice for a new
// timed event (R28). An Outlook event shows its time as text (R11).
// Start and end are chosen as in the "New event" card: a field to type "HH:MM", the scrolling wheel under
// it. An end at or before the start is on the next day (an event may run past midnight).
import { useState, type ReactNode } from "react";
import { useDisplay } from "@/components/shell/DisplayProvider";
import { weekdayOf, type Weekday } from "@/lib/events/repeat";
import type { CalendarEvent } from "@/lib/events/types";
import { fmtDateShort, fmtMinutes, fmtRange, fmtTime } from "@/lib/time/display";
import { endProblem } from "@/lib/time/wheel";
import { DateField, Eyebrow, ToggleChip, inputClass } from "../fields";
import { TimeField, TimeWheel } from "../TimeWheel";
import { moveFirstDay, switchAllDay, type EventValues, type Repeat } from "./values";

const DAY = 24 * 60;

/** The end for a time picked on the wheel or typed (0 to 23:59): at or before the start, it is on the next day. */
export function endFromPicked(startMin: number, picked: number): number {
  return picked <= startMin ? picked + DAY : picked;
}

const switchClass =
  "relative h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full bg-line transition-colors checked:bg-ink before:absolute before:top-0.5 before:left-0.5 before:size-4 before:rounded-full before:bg-white before:shadow-sm before:transition-transform checked:before:translate-x-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-1";

type Props = {
  /** The repeat choice of a new event, shown at the end of the section. */
  children?: ReactNode;
  /** The saved event, or null for a new one. */
  event: CalendarEvent | null;
  values: EventValues;
  onChange: (patch: Partial<EventValues>) => void;
  todayKey: string;
};

export function WhenSection({ event, values, onChange, todayKey, children }: Props) {
  const { timeFormat } = useDisplay();
  // Which time's wheel is showing under the fields, if any.
  const [wheel, setWheel] = useState<"start" | "end" | null>(null);

  if (event?.source === "outlook") {
    return (
      <section className="flex flex-col gap-1.5">
        <Eyebrow>When</Eyebrow>
        <div>
          <p className="text-sm tabular text-ink">{outlookWhen(event, timeFormat)}</p>
          <p className="mt-1 text-xs text-ink-3">Time and title are managed in Outlook.</p>
        </div>
      </section>
    );
  }

  const inSeries = Boolean(event?.seriesId);
  const length = values.endMin - values.startMin;
  // A new start keeps the length.
  const setStart = (startMin: number) => onChange({ startMin, endMin: startMin + length });
  const setEnd = (picked: number) => onChange({ endMin: endFromPicked(values.startMin, picked) });
  const timeProblem = endProblem(values.startMin, values.endMin);

  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>When</Eyebrow>
        {/* A series is timed (R29), so its events do not offer the switch. */}
        {!inSeries && (
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-ink-2">
            All day
            <input type="checkbox" role="switch" checked={values.allDay} onChange={(e) => onChange(switchAllDay(values, e.target.checked))} className={switchClass} />
          </label>
        )}
      </div>
      {values.allDay ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs text-ink-2">First day</span>
            <DateField label="First day" value={values.firstDay} todayKey={todayKey} onChange={(day) => onChange(moveFirstDay(values, day))} />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs text-ink-2">Last day</span>
            <DateField label="Last day" value={values.lastDay} todayKey={todayKey} onChange={(lastDay) => onChange({ lastDay })} />
          </div>
        </div>
      ) : (
        <>
          <DateField label="Date" value={values.date} todayKey={todayKey} onChange={(date) => onChange({ date })} />
          <div
            className="flex flex-col gap-3"
            onKeyDown={(e) => {
              // Esc first folds the wheel; the next Esc closes the card.
              if (wheel && e.key === "Escape" && !e.defaultPrevented) {
                e.preventDefault();
                e.stopPropagation();
                setWheel(null);
              }
            }}
          >
            <div className="flex items-start gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-xs text-ink-2">Start</span>
                <TimeField label="Start time" value={values.startMin} onChange={setStart} open={wheel === "start"} onOpen={() => setWheel("start")} />
              </div>
              <span aria-hidden className="mt-7 text-sm text-ink-3">
                –
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-xs text-ink-2 tabular">
                  End
                  {length > 0 && ` · ${fmtMinutes(length)}`}
                  {values.endMin >= DAY && " · next day"}
                </span>
                <TimeField label="End time" value={values.endMin % DAY} onChange={setEnd} open={wheel === "end"} onOpen={() => setWheel("end")} />
              </div>
            </div>

            {wheel && (
              <TimeWheel label={wheel === "start" ? "Start" : "End"} value={wheel === "start" ? values.startMin : values.endMin % DAY} onChange={wheel === "start" ? setStart : setEnd} />
            )}

            {timeProblem && (
              <p role="alert" className="text-xs text-danger">
                {timeProblem}
              </p>
            )}
          </div>
        </>
      )}
      {children}
    </section>
  );
}

/** An Outlook event's time as text, as in the prototype: "Tue, Nov 17 · 9 – 10:30am". */
function outlookWhen(event: CalendarEvent, format: "12h" | "24h"): string {
  if (event.allDay) {
    const first = fmtDateShort(event.firstDay);
    return event.lastDay === event.firstDay ? `${first} · All day` : `${first} – ${fmtDateShort(event.lastDay)} · All day`;
  }
  const day = event.startLocal.slice(0, 10);
  if (!event.endDay) return `${fmtDateShort(day)} · ${fmtRange(event.startTime, event.endTime, format)}`;
  return `${fmtDateShort(day)} ${fmtTime(event.startTime, format)} – ${fmtDateShort(event.endDay)} ${fmtTime(event.endTime, format)}`;
}

const WEEKDAYS: { day: Weekday; short: string; long: string }[] = [
  { day: 1, short: "Mon", long: "Monday" },
  { day: 2, short: "Tue", long: "Tuesday" },
  { day: 3, short: "Wed", long: "Wednesday" },
  { day: 4, short: "Thu", long: "Thursday" },
  { day: 5, short: "Fri", long: "Friday" },
  { day: 6, short: "Sat", long: "Saturday" },
  { day: 7, short: "Sun", long: "Sunday" },
];

export type Frequency = "none" | Repeat["frequency"];

/** The repeat choice of a new timed event (R28): how often, on which weekdays, until when. */
export function RepeatFields({
  date,
  frequency,
  weekdays,
  until,
  todayKey,
  onFrequency,
  onWeekdays,
  onUntil,
}: {
  date: string;
  frequency: Frequency;
  weekdays: Weekday[];
  until: string;
  todayKey: string;
  onFrequency: (f: Frequency) => void;
  onWeekdays: (days: Weekday[]) => void;
  onUntil: (day: string) => void;
}) {
  const first = weekdayOf(date);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="new-repeat" className="sr-only">
        Repeat
      </label>
      <select id="new-repeat" value={frequency} onChange={(e) => onFrequency(e.target.value as Frequency)} className={`${inputClass} pr-8`}>
        <option value="none">Does not repeat</option>
        <option value="daily">Every day</option>
        <option value="weekly">Every week</option>
        <option value="monthly">Every month</option>
      </select>
      {frequency === "weekly" && (
        <div role="group" aria-label="On these days" className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map(({ day, short, long }) => {
            // The first date's weekday is always included.
            const fixed = day === first;
            const pressed = fixed || weekdays.includes(day);
            return (
              <ToggleChip
                key={day}
                pressed={pressed}
                disabled={fixed}
                ariaLabel={fixed ? `${long}, the first date's day, always included` : long}
                onClick={() => onWeekdays(pressed ? weekdays.filter((d) => d !== day) : [...weekdays, day])}
              >
                {short}
              </ToggleChip>
            );
          })}
        </div>
      )}
      {frequency !== "none" && (
        <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-2">
          <span className="pt-2 text-xs text-ink-2">Until</span>
          <DateField label="Until" value={until} todayKey={todayKey} onChange={onUntil} />
        </div>
      )}
    </div>
  );
}
