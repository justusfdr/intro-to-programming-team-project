// One row under a goal in the goals column: a ring in the goal's colour while open, a filled circle
// with a white check when done, the text, and an optional small chip at the right. Used for the
// rules of this week and for tasks (spec 11). For a task the ring is a real button (`toggle`); for a
// rule it is only a picture. `colorIndex` null is the grey of "Inbox".
import type { ReactNode } from "react";
import { Check } from "@/components/ui/icons";
import { goalColor } from "@/lib/goals/colors";

type Props = {
  colorIndex: number | null;
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
};

const GREY = { dot: "bg-ink-3", ring: "border-ink-3" };

export function GoalRow({ colorIndex, done, children, struck = false, doneLabel = "done", chip, toggle }: Props) {
  const color = colorIndex === null ? GREY : goalColor(colorIndex);
  const mark = done ? (
    <span aria-hidden className={`flex size-[18px] shrink-0 items-center justify-center rounded-full text-white ${color.dot}`}>
      <Check className="size-3" strokeWidth={3} />
    </span>
  ) : (
    <span aria-hidden className={`block size-[18px] shrink-0 rounded-full border-[1.5px] ${color.ring}`} />
  );
  return (
    <li className="flex min-h-8 items-center gap-2.5 text-[14px]">
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
      ) : (
        mark
      )}
      <span className={`min-w-0 flex-1 ${struck ? "text-ink-3 line-through" : "text-ink"}`}>{children}</span>
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
