"use client";

// A small month calendar, copied from the first prototype (components/calendar/fields.tsx there):
// the month with previous and next, the weekdays from Monday, the 6 × 7 days; today in red, the
// chosen day black. The shown month starts at the month of `value` (without a value: of `min`, else of
// today). Days before `min` cannot be chosen.
// A click on the title ("November 2026") shows the 12 months of that year; a click on the year there
// shows 12 years. Picking a year shows its months, picking a month shows its days again.
import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, monthGrid, startOfMonth, viewTitle } from "@/lib/events/views";
import { fmtDateLong } from "@/lib/time/display";

const ICON_BUTTON =
  "inline-flex size-8 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20";

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function MiniMonth({
  value,
  onChange,
  todayKey,
  min,
}: {
  /** The chosen day, or "" when none is chosen yet. */
  value: string;
  onChange: (dayKey: string) => void;
  todayKey: string;
  /** The earliest day that can be chosen. */
  min?: string;
}) {
  const [shown, setShown] = useState(() => startOfMonth(value || (min && min > todayKey ? min : todayKey)));
  // What the calendar shows: the days of a month, the months of a year, or 12 years.
  const [level, setLevel] = useState<"days" | "months" | "years">("days");
  const days = monthGrid(shown);

  if (level !== "days") {
    return (
      <PeriodGrid
        level={level}
        shown={shown}
        value={value}
        todayKey={todayKey}
        onShown={setShown}
        onLevel={setLevel}
      />
    );
  }

  return (
    <div className="w-[260px] max-w-full">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button type="button" aria-label="Previous month" onClick={() => setShown((d) => addMonths(d, -1))} className={ICON_BUTTON}>
          <ChevronLeft className="size-4" strokeWidth={2} />
        </button>
        <button
          type="button"
          aria-label={`${viewTitle("month", shown)}: choose a month or year`}
          onClick={() => setLevel("months")}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold text-ink transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
        >
          {viewTitle("month", shown)}
          <ChevronDown className="size-3.5 text-ink-3" strokeWidth={2} aria-hidden />
        </button>
        <button type="button" aria-label="Next month" onClick={() => setShown((d) => addMonths(d, 1))} className={ICON_BUTTON}>
          <ChevronRight className="size-4" strokeWidth={2} />
        </button>
      </div>

      <div className="grid grid-cols-7 pb-1">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="text-center text-[11px] text-ink-3">
            {label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((key) => {
          const selected = key === value;
          const today = key === todayKey;
          const tooEarly = min !== undefined && key < min;
          const inMonth = key.slice(0, 7) === shown.slice(0, 7);
          const tone = selected
            ? "bg-ink font-medium text-white"
            : today
              ? "font-semibold text-today hover:bg-raised"
              : inMonth
                ? "text-ink hover:bg-raised"
                : "text-ink-3 hover:bg-raised";
          return (
            <button
              key={key}
              type="button"
              aria-pressed={selected}
              aria-label={`${fmtDateLong(key)}, ${key.slice(0, 4)}`}
              disabled={tooEarly}
              onClick={() => onChange(key)}
              className={`mx-auto inline-flex size-8 items-center justify-center rounded-full text-xs tabular transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 disabled:pointer-events-none disabled:opacity-35 ${tone}`}
            >
              {Number(key.slice(8, 10))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The first of the 12 years shown that hold this year (blocks 2016–2027, 2028–2039, …). */
export function firstOfYears(year: number): number {
  return year - (((year % 12) + 12) % 12);
}

/** The months of a year or 12 years, as a grid of 3 × 4; the shown, chosen and current one are marked. */
function PeriodGrid({
  level,
  shown,
  value,
  todayKey,
  onShown,
  onLevel,
}: {
  level: "months" | "years";
  shown: string;
  value: string;
  todayKey: string;
  onShown: (day: string) => void;
  onLevel: (level: "days" | "months" | "years") => void;
}) {
  const year = Number(shown.slice(0, 4));
  const month = Number(shown.slice(5, 7));
  const first = firstOfYears(year);
  const pad = (n: number) => String(n).padStart(2, "0");
  const step = level === "months" ? 1 : 12;
  const move = (by: number) => onShown(`${year + by}-${pad(month)}-01`);
  const title = level === "months" ? String(year) : `${first} – ${first + 11}`;

  const cells =
    level === "months"
      ? MONTHS.map((label, i) => ({
          key: `${year}-${pad(i + 1)}`,
          label,
          name: `${MONTHS_LONG[i]} ${year}`,
          chosen: value.slice(0, 7) === `${year}-${pad(i + 1)}`,
          current: todayKey.slice(0, 7) === `${year}-${pad(i + 1)}`,
          pick: () => {
            onShown(`${year}-${pad(i + 1)}-01`);
            onLevel("days");
          },
        }))
      : Array.from({ length: 12 }, (_, i) => first + i).map((y) => ({
          key: String(y),
          label: String(y),
          name: String(y),
          chosen: value.slice(0, 4) === String(y),
          current: todayKey.slice(0, 4) === String(y),
          pick: () => {
            onShown(`${y}-${pad(month)}-01`);
            onLevel("months");
          },
        }));

  return (
    <div className="w-[260px] max-w-full">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button type="button" aria-label={level === "months" ? "Previous year" : "Previous years"} onClick={() => move(-step)} className={ICON_BUTTON}>
          <ChevronLeft className="size-4" strokeWidth={2} />
        </button>
        <button
          type="button"
          aria-label={level === "months" ? `${title}: choose a year` : `${title}: back to the months`}
          onClick={() => onLevel(level === "months" ? "years" : "months")}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold text-ink tabular transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
        >
          {title}
          <ChevronDown className={`size-3.5 text-ink-3 ${level === "years" ? "rotate-180" : ""}`} strokeWidth={2} aria-hidden />
        </button>
        <button type="button" aria-label={level === "months" ? "Next year" : "Next years"} onClick={() => move(step)} className={ICON_BUTTON}>
          <ChevronRight className="size-4" strokeWidth={2} />
        </button>
      </div>
      <div role="group" aria-label={level === "months" ? `Months of ${year}` : "Years"} className="grid grid-cols-3 gap-1.5 py-1">
        {cells.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-pressed={c.chosen}
            aria-label={c.name}
            onClick={c.pick}
            className={`h-11 rounded-full text-sm tabular transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 ${
              c.chosen ? "bg-ink font-medium text-white" : c.current ? "font-semibold text-today hover:bg-raised" : "text-ink hover:bg-raised"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => onLevel("days")} className="mt-1 w-full rounded-full py-1.5 text-xs text-ink-2 hover:bg-raised hover:text-ink">
        Back to days
      </button>
    </div>
  );
}
