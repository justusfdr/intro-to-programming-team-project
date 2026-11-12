// One row under a goal in the goals column: a ring in the goal's colour while open, a filled circle
// with a white check when done, the text, and an optional small chip at the right. Used for the
// rules of this week; kept separate so other rows under a goal can look the same.
import type { ReactNode } from "react";
import { Check } from "@/components/ui/icons";
import { goalColor } from "@/lib/goals/colors";

type Props = {
  colorIndex: number;
  done: boolean;
  children: ReactNode;
  /** Grey, struck-through text (for example a met rule). */
  struck?: boolean;
  /** Said to screen readers after the text, because the ring or check alone is only a picture. */
  doneLabel?: string;
  /** A small chip at the right, such as a date; `tone` "danger" is red on a light red tint. */
  chip?: { text: string; tone?: "neutral" | "danger" };
};

export function GoalRow({ colorIndex, done, children, struck = false, doneLabel = "done", chip }: Props) {
  const color = goalColor(colorIndex);
  return (
    <li className="flex min-h-8 items-center gap-2.5 text-[14px]">
      {done ? (
        <span aria-hidden className={`flex size-[18px] shrink-0 items-center justify-center rounded-full text-white ${color.dot}`}>
          <Check className="size-3" strokeWidth={3} />
        </span>
      ) : (
        <span aria-hidden className={`block size-[18px] shrink-0 rounded-full border-[1.5px] ${color.ring}`} />
      )}
      <span className={`min-w-0 flex-1 ${struck ? "text-ink-3 line-through" : "text-ink"}`}>{children}</span>
      {done && <span className="sr-only">, {doneLabel}</span>}
      {chip && (
        <span
          className={`inline-flex h-5 shrink-0 items-center rounded-md px-1.5 text-[11px] font-medium tabular ${
            chip.tone === "danger" ? "bg-danger-soft text-danger" : "bg-raised text-ink-2"
          }`}
        >
          {chip.text}
        </span>
      )}
    </li>
  );
}
