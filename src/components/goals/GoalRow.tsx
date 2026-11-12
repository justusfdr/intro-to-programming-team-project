// One row under a goal in the goals column: a ring in the goal's colour while open, a filled circle
// with a white check when done, the text, and an optional small chip at the right. Used for the
// rules of this week and for tasks (spec 11). For a task the ring is a real button (`toggle`); for a
// rule it is only a picture. `color` null is the grey of "Inbox".
import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { goalColor } from "@/lib/goals/colors";
import type { GoalColorName } from "@/lib/goals/style";

type Props = {
  color: GoalColorName | null;
  done: boolean;
  children: ReactNode;
  /** Grey, struck-through text (for example a met rule or a done task). */
  struck?: boolean;
  /** Said to screen readers after the text, because the ring or check alone is only a picture. */
  doneLabel?: string;
  /**
   * A small chip at the right, such as a date; `tone` "danger" is red on a light red tint.
   * `srPrefix` is read before the text by screen readers only (for example "Overdue, due ").
   */
  chip?: { text: string; tone?: "neutral" | "danger"; srPrefix?: string };
  /** Makes the ring a button with this name ("Mark 'Buy shoes' done"). */
  toggle?: { label: string; onClick: () => void; disabled?: boolean };
  /**
   * A smaller, quieter row for things that cannot be ticked off (the rules of this week): a 12px ring
   * or check, 12px secondary text, a lower row. Task rows use the normal size.
   */
  compact?: boolean;
};

const GREY = { dot: "bg-ink-3", ring: "border-ink-3" };

export function GoalRow({ color: colorName, done, children, struck = false, doneLabel = "done", chip, toggle, compact = false }: Props) {
  const color = colorName === null ? GREY : goalColor(colorName);
  // The compact mark is 12px, centred in the same 18px column, so its text lines up with the tasks.
  const size = compact ? "size-3" : "size-[18px]";
  const mark = done ? (
    <span aria-hidden className={`flex ${size} shrink-0 items-center justify-center rounded-full text-white ${color.dot}`}>
      <Check className={compact ? "size-2" : "size-3"} strokeWidth={3} />
    </span>
  ) : (
    <span aria-hidden className={`block ${size} shrink-0 rounded-full ${compact ? "border-[1.25px]" : "border-[1.5px]"} ${color.ring}`} />
  );
  const text = struck ? "text-ink-3 line-through" : compact ? "text-ink-2" : "text-ink";
  return (
    <li className={compact ? "flex min-h-6 cursor-default items-center gap-2.5 text-[12px]" : "flex min-h-8 items-center gap-2.5 text-[14px]"}>
      {toggle ? (
        // The visible circle is 18px; the button's pseudo-element gives a larger area to tap.
        <button
          type="button"
          aria-label={toggle.label}
          title={toggle.label}
          onClick={toggle.onClick}
          disabled={toggle.disabled}
          className="relative shrink-0 rounded-full before:absolute before:-inset-2 before:content-[''] hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-1 disabled:opacity-50"
        >
          {mark}
        </button>
      ) : compact ? (
        <span className="flex size-[18px] shrink-0 items-center justify-center">{mark}</span>
      ) : (
        mark
      )}
      <span className={`min-w-0 flex-1 ${text}`}>{children}</span>
      {done && <span className="sr-only">, {doneLabel}</span>}
      {chip && (
        <span
          className={`inline-flex h-5 shrink-0 items-center rounded-md px-1.5 text-[11px] font-medium tabular ${
            chip.tone === "danger" ? "bg-danger-soft text-danger" : "bg-raised text-ink-2"
          }`}
        >
          {chip.srPrefix && <span className="sr-only">{chip.srPrefix}</span>}
          {chip.text}
        </span>
      )}
    </li>
  );
}
