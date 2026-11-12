"use client";

// Small form pieces of the calendar's floating cards, copied from the first prototype: the field
// frame, the eyebrow label, a chip that can be pressed, the goal chips and a time list.
import type { ReactNode } from "react";
import { GoalTile } from "@/components/goals/GoalTile";
import { useDisplay } from "@/components/shell/DisplayProvider";
import { fmtMinutes, fmtTime } from "@/lib/time/display";
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
        const text = m === DAY_MIN ? `${time} (midnight)` : time;
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
