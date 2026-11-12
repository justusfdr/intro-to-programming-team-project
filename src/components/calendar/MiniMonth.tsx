"use client";

// A small month calendar, copied from the first prototype (components/calendar/fields.tsx there):
// the month with previous and next, the weekdays from Monday, the 6 × 7 days; today in red, the
// chosen day black. The shown month starts at the month of `value`.
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, monthGrid, startOfMonth, viewTitle } from "@/lib/events/views";
import { fmtDateLong } from "@/lib/time/display";

const ICON_BUTTON =
  "inline-flex size-8 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20";

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function MiniMonth({ value, onChange, todayKey }: { value: string; onChange: (dayKey: string) => void; todayKey: string }) {
  const [shown, setShown] = useState(() => startOfMonth(value));
  const days = monthGrid(shown);

  return (
    <div className="w-[260px] max-w-full">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button type="button" aria-label="Previous month" onClick={() => setShown((d) => addMonths(d, -1))} className={ICON_BUTTON}>
          <ChevronLeft className="size-4" strokeWidth={2} />
        </button>
        <p className="text-sm font-semibold text-ink">{viewTitle("month", shown)}</p>
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
              onClick={() => onChange(key)}
              className={`mx-auto inline-flex size-8 items-center justify-center rounded-full text-xs tabular transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 ${tone}`}
            >
              {Number(key.slice(8, 10))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
