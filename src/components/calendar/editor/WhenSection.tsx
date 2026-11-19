"use client";

// WHEN, as in the prototype: the date button with its month calendar, then start and end (the end
// also shows the length). Ours in the same style: the all-day switch next to the heading (not for an
// event of a series, R29), first and last day for an all-day event, and the repeat choice for a new
// timed event (R28). An Outlook event shows its time as text (R11).
// Start and end are chosen as in the "New event" card: a field to type "HH:MM", the scrolling wheel under
// it. An end before the start is on the next day; an end equal to the start is refused (an event may run past midnight).
import { useState, type ReactNode } from "react";
import { ChevronDown, Repeat2 } from "lucide-react";
import { useDisplay } from "@/components/shell/DisplayProvider";
import { weekdayOf, type Weekday } from "@/lib/events/repeat";
import type { CalendarEvent } from "@/lib/events/types";
import { fmtDateShort, fmtMinutes, fmtRange, fmtTime } from "@/lib/time/display";
import { endProblem } from "@/lib/time/wheel";
import { DateField, Eyebrow } from "../fields";
import { TimeField, TimeWheel } from "../TimeWheel";
import { moveFirstDay, switchAllDay, type EventValues, type Repeat } from "./values";

const DAY = 24 * 60;

/**
 * The end for a time picked on the wheel or typed (0 to 23:59): before the start, it is on the next day.
 * The same time as the start stays as it is (not a 24-hour event): the red message asks for a later end.
 */
export function endFromPicked(startMin: number, picked: number): number {
  return picked < startMin ? picked + DAY : picked;
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
        <div className="grid grid-cols-1 gap-2">
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

const WEEKDAYS: { day: Weekday; letter: string; short: string; long: string }[] = [
  { day: 1, letter: "M", short: "Mon", long: "Monday" },
  { day: 2, letter: "T", short: "Tue", long: "Tuesday" },
  { day: 3, letter: "W", short: "Wed", long: "Wednesday" },
  { day: 4, letter: "T", short: "Thu", long: "Thursday" },
  { day: 5, letter: "F", short: "Fri", long: "Friday" },
  { day: 6, letter: "S", short: "Sat", long: "Saturday" },
  { day: 7, letter: "S", short: "Sun", long: "Sunday" },
];

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "none", label: "Never" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const MON_TO_FRI: Weekday[] = [1, 2, 3, 4, 5];

export type Frequency = "none" | Repeat["frequency"];

/** "1st", "2nd", "3rd", "17th". */
function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** "Tue & Thu", "Mon, Wed & Fri". */
function dayList(days: Weekday[]): string {
  const names = WEEKDAYS.filter((w) => days.includes(w.day)).map((w) => w.short);
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

/**
 * The repeat in one sentence, as in Google Calendar: "Does not repeat", "Every day", "Every weekday",
 * "Every Tue & Thu", "Every month on the 17th", each with "until Dec 20" when it repeats.
 */
export function repeatSentence(frequency: Frequency, days: Weekday[], date: string, until: string): string {
  if (frequency === "none") return "Does not repeat";
  const end = until ? ` · until ${fmtDateShort(until)}` : "";
  if (frequency === "daily") return `Every day${end}`;
  if (frequency === "monthly") return `Every month on the ${ordinal(Number(date.slice(8, 10)))}${end}`;
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 7) return `Every day${end}`;
  if (sorted.join() === MON_TO_FRI.join()) return `Every weekday${end}`;
  return `Every ${dayList(sorted)}${end}`;
}

/**
 * The repeat choice of a new timed event (R28). Folded it is one line with the sentence
 * ("Every Tue & Thu · until Dec 20"); opened: Never | Daily | Weekly | Monthly, the weekdays as round
 * buttons (a tap on a day makes it weekly; the first date's day is always included), "Mon–Fri", and Until.
 */
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
  const [open, setOpen] = useState(false);
  const first = weekdayOf(date);
  const weekly = frequency === "weekly";
  // The first date's weekday is always included.
  const chosen = weekdays.includes(first) ? weekdays : [...weekdays, first];

  const tapDay = (day: Weekday) => {
    if (!weekly) {
      onFrequency("weekly");
      return onWeekdays(day === first ? [] : [day]);
    }
    if (day === first) return;
    onWeekdays(weekdays.includes(day) ? weekdays.filter((d) => d !== day) : [...weekdays, day]);
  };

  return (
    <div className="flex flex-col rounded-lg border border-line-subtle">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Repeat: ${repeatSentence(frequency, chosen, date, until)}`}
        onClick={() => setOpen((o) => !o)}
        className="flex min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
      >
        <Repeat2 className="size-4 shrink-0 text-ink-3" strokeWidth={1.8} aria-hidden />
        <span className="shrink-0 text-xs text-ink-2">Repeat</span>
        <span className={`min-w-0 flex-1 truncate text-sm ${frequency === "none" ? "text-ink-3" : "font-medium text-ink"}`}>{repeatSentence(frequency, chosen, date, until)}</span>
        <ChevronDown className={`size-4 shrink-0 text-ink-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-line-subtle px-2.5 pb-3 pt-2.5">
          <div role="radiogroup" aria-label="How often" className="grid grid-cols-4 gap-0.5 rounded-full bg-raised p-0.5">
            {FREQUENCIES.map((f) => (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={frequency === f.value}
                onClick={() => onFrequency(f.value)}
                className={`h-7 rounded-full text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 ${
                  frequency === f.value ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <div role="group" aria-label="On these days" className="flex justify-between">
              {WEEKDAYS.map(({ day, letter, long }) => {
                const fixed = day === first;
                const pressed = weekly && chosen.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={pressed}
                    aria-label={fixed && weekly ? `${long}, the first date's day, always included` : long}
                    onClick={() => tapDay(day)}
                    className={`size-8 shrink-0 rounded-full text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 pointer-coarse:size-9 ${
                      pressed ? "bg-ink text-surface" : weekly ? "border border-line-subtle text-ink-2 hover:bg-raised" : "border border-dashed border-line-subtle text-ink-3 hover:bg-raised hover:text-ink"
                    } ${fixed && weekly ? "cursor-default" : ""}`}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-ink-3">{weekly ? "Tap days to change them." : "Tap a day to repeat weekly."}</span>
              <button
                type="button"
                onClick={() => {
                  onFrequency("weekly");
                  onWeekdays(MON_TO_FRI.filter((d) => d !== first));
                }}
                className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium text-ink-2 hover:bg-raised hover:text-ink"
              >
                Mon–Fri
              </button>
            </div>
          </div>

          {frequency !== "none" && (
            <div className="grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-2">
              <span className="text-xs text-ink-2">Until</span>
              <DateField label="Until" value={until} todayKey={todayKey} onChange={onUntil} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
