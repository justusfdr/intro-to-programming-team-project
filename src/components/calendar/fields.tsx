"use client";

// Small form pieces of the calendar's floating cards, copied from the first prototype: the field
// frame, the eyebrow label, a chip that can be pressed, the goal chips, a time list and the date field
// with its folded month calendar.
import { useRef, useState, type ReactNode } from "react";
import { CalendarDays, X } from "lucide-react";
import { GoalTile } from "@/components/goals/GoalTile";
import { useDisplay } from "@/components/shell/DisplayProvider";
import { fmtDateShort, fmtDateShortFrom, fmtMinutes, fmtTime } from "@/lib/time/display";
import { MiniMonth } from "./MiniMonth";
import type { GoalLabel } from "./TimeGrid";

const DAY_MIN = 24 * 60;

export const inputClass =
  "h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10";

/** The small grey capital label over a field. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">{children}</p>;
}

/** A pill that is pressed or not (aria-pressed). */
export function ToggleChip({
  pressed,
  onClick,
  children,
  className = "",
  disabled = false,
  ariaLabel,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-xs pointer-coarse:h-9 pointer-coarse:px-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 disabled:pointer-events-none disabled:opacity-40 ${
        pressed ? "border-ink bg-raised font-medium text-ink" : "border-line-subtle text-ink-2 hover:bg-raised"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** The goal as chips: "No goal", then every goal. */
export function GoalChips({ goals, value, onChange }: { goals: GoalLabel[]; value: string | null; onChange: (goalId: string | null) => void }) {
  return (
    <div role="group" aria-label="Goal" className="flex flex-wrap gap-1.5">
      <ToggleChip pressed={value === null} onClick={() => onChange(null)}>
        <GoalTile look={null} size="xs" />
        No goal
      </ToggleChip>
      {goals.map((g) => (
        <ToggleChip key={g.id} pressed={value === g.id} onClick={() => onChange(g.id)}>
          <GoalTile look={g.look} size="xs" />
          <span className="min-w-0 max-w-[180px] truncate">{g.title}</span>
        </ToggleChip>
      ))}
    </div>
  );
}

/**
 * A time as a native list (minutes after midnight), every `step` minutes from `from` to `to`.
 * With `durationFrom` each option also shows the length from that time.
 */
export function TimeSelect({
  label,
  value,
  onChange,
  from = 0,
  to = DAY_MIN,
  step = 15,
  durationFrom,
}: {
  label: string;
  value: number;
  onChange: (min: number) => void;
  from?: number;
  to?: number;
  step?: number;
  durationFrom?: number;
}) {
  const { timeFormat } = useDisplay();
  const minutes: number[] = [];
  for (let m = from; m <= to; m += step) minutes.push(m);
  // A value between the steps stays visible.
  if (!minutes.includes(value)) {
    minutes.push(value);
    minutes.sort((a, b) => a - b);
  }
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value))} className={`${inputClass} pr-8 tabular`}>
      {minutes.map((m) => {
        const time = fmtTime(m, timeFormat);
        const text = m === DAY_MIN ? `${time} (midnight)` : m > DAY_MIN ? `${time} (next day)` : time;
        const duration = durationFrom !== undefined && m > durationFrom ? ` · ${fmtMinutes(m - durationFrom)}` : "";
        return (
          <option key={m} value={m}>
            {text}
            {duration}
          </option>
        );
      })}
    </select>
  );
}

/**
 * The date field: shows the date like a field. A click unfolds the month calendar below it (no
 * overlay). Choosing a day folds it; Esc folds only the calendar. `label` names the button for
 * screen readers ("Date", "First day"). Also used for a task's due date and a goal's deadline
 * (spec 39): `min` greys out earlier days, `placeholder` is shown quietly while there is no date,
 * `clear` adds a small button that removes the date, `name` sends the value ("YYYY-MM-DD", or empty)
 * with a form, and `tall` gives it the 40 px height of the goal and task forms.
 */
export function DateField({
  label,
  value,
  onChange,
  todayKey,
  disabled = false,
  min,
  placeholder = "",
  clear,
  name,
  id,
  tall = false,
  withYear = false,
}: {
  label: string;
  value: string;
  onChange: (dayKey: string) => void;
  todayKey: string;
  disabled?: boolean;
  min?: string;
  placeholder?: string;
  clear?: { label: string; onClear: () => void };
  name?: string;
  id?: string;
  tall?: boolean;
  /** Name the year when it is not today's (the repeat's end date, spec 66). */
  withYear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // withYear (spec 66): another year than today's is named, "Wed, Nov 17, 2027", never a bare "Wed, Nov 17".
  const shown = value ? (withYear ? fmtDateShortFrom(value, todayKey) : fmtDateShort(value)) : placeholder;
  const canClear = clear !== undefined && value !== "" && !disabled;

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <div
      className="flex flex-col"
      onKeyDown={(e) => {
        // preventDefault: the floating panel (or the form around it) does not close as well.
        if (open && e.key === "Escape") {
          e.preventDefault();
          close();
        }
      }}
    >
      {name !== undefined && <input type="hidden" name={name} value={value} />}
      <div className="flex items-center gap-1">
        <button
          ref={buttonRef}
          id={id}
          type="button"
          disabled={disabled}
          aria-expanded={open}
          aria-label={value ? `${label}: ${fmtDateShort(value)}` : label}
          onClick={() => setOpen((o) => !o)}
          className={`${tall ? inputClass.replace("h-9", "h-10") : inputClass} flex items-center gap-2 text-left disabled:pointer-events-none disabled:opacity-40${canClear ? " min-w-0 flex-1" : ""}`}
        >
          <CalendarDays className="size-4 shrink-0 text-ink-3" strokeWidth={1.8} />
          <span className={`min-w-0 flex-1 truncate tabular${value ? "" : " text-ink-3"}`}>{shown}</span>
        </button>
        {canClear && (
          <button
            type="button"
            aria-label={clear.label}
            title={clear.label}
            onClick={() => {
              clear.onClear();
              setOpen(false);
              buttonRef.current?.focus();
            }}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
          >
            <X className="size-3.5" strokeWidth={2} />
          </button>
        )}
      </div>

      {open && !disabled && (
        <div className="mt-2 rounded-card border border-line-subtle bg-surface p-3">
          <MiniMonth
            value={value}
            todayKey={todayKey}
            min={min}
            onChange={(key) => {
              onChange(key);
              close();
            }}
          />
        </div>
      )}
    </div>
  );
}
