// One goal in the goals panel (R9): its colour and title, the countdown, per rule "This week: 1 of 2
// done" or "This week: 3.5 of 6 h", and the strip of weeks from creation to deadline.
// Every status is said in words and shown with a symbol, so nothing depends on colour alone.
import { goalColor } from "@/lib/goals/colors";
import type { StripWeek, WeekStatus } from "@/lib/goals/progress";
import type { GoalView } from "@/lib/goals/types";
import { Check, Close } from "@/components/ui/icons";
import { dayParts } from "@/lib/time/zoned";

const STATUS_WORD: Record<WeekStatus, string> = { met: "met", missed: "missed", open: "open" };

function StatusMark({ status }: { status: WeekStatus }) {
  if (status === "met") return <Check className="size-3 text-success" strokeWidth={3} />;
  if (status === "missed") return <Close className="size-3 text-danger" strokeWidth={3} />;
  return <span aria-hidden className="block size-2 rounded-full border border-ink-3" />;
}

function WeekCell({ week }: { week: StripWeek }) {
  const { day } = dayParts(week.monday);
  const month = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(new Date(`${week.monday}T00:00:00Z`));
  const box =
    week.status === "met"
      ? "border-success/40 bg-success-soft"
      : week.status === "missed"
        ? "border-danger/40 bg-danger-soft"
        : "border-line bg-surface";
  return (
    <li
      className={`flex size-5 items-center justify-center rounded-[5px] border ${box} ${week.isCurrent ? "ring-2 ring-ink/70 ring-offset-1" : ""}`}
      title={`Week of ${day} ${month}: ${STATUS_WORD[week.status]}`}
    >
      <span className="sr-only">{`Week of ${day} ${month}${week.isCurrent ? " (this week)" : ""}: ${STATUS_WORD[week.status]}`}</span>
      <StatusMark status={week.status} />
    </li>
  );
}

type Props = {
  goal: GoalView;
  /** Opens the goal in the editor (filled in by the edit task). */
  onOpen?: () => void;
};

export function GoalCard({ goal, onOpen }: Props) {
  const color = goalColor(goal.colorIndex);
  const passed = goal.progress.countdown === "Deadline passed";
  const title = <span className="min-w-0 truncate text-sm font-semibold text-ink">{goal.title}</span>;

  return (
    <article aria-label={goal.title} className="rounded-card border border-line-subtle bg-surface p-3">
      <div className="flex items-center gap-2">
        <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${color.dot}`} />
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            className="min-w-0 flex-1 truncate rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
            aria-label={`Edit goal ${goal.title}`}
          >
            {title}
          </button>
        ) : (
          <h3 className="min-w-0 flex-1 truncate">{title}</h3>
        )}
        <span className={`shrink-0 text-[11px] tabular ${passed ? "font-medium text-danger" : "text-ink-2"}`}>{goal.progress.countdown}</span>
      </div>

      <ul className="mt-2 flex flex-col gap-1">
        {goal.progress.thisWeek.map((rule) => (
          <li key={rule.ruleId} className="flex items-center gap-1.5 text-xs text-ink-2">
            <StatusMark status={rule.status} />
            <span>{rule.text}</span>
            {rule.status === "met" && <span className="sr-only">, met</span>}
          </li>
        ))}
      </ul>

      <ol aria-label="Weeks" className="mt-2.5 flex flex-wrap gap-1">
        {goal.progress.weeks.map((week) => (
          <WeekCell key={week.monday} week={week} />
        ))}
      </ol>

      {goal.autoBlock && <p className="mt-2 text-[11px] text-ink-3">Auto-block on (starts working with the blocker)</p>}
    </article>
  );
}
