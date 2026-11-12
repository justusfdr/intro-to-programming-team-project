// One goal in the goals column (R9), as an open section without a card border: a chevron that
// collapses it, the goal's tile and title, a thin bar for how far this week's rules
// are, one row per rule ("This week: 1 of 2 done"), the strip of weeks, and a caption with the
// countdown and "Auto-block on".
// Every status is said in words and shown with a symbol, so nothing depends on colour alone.
import { useId, type ReactNode } from "react";
import { Check, ChevronRight, Close } from "@/components/ui/icons";
import { goalColor } from "@/lib/goals/colors";
import type { StripWeek, WeekStatus } from "@/lib/goals/progress";
import { weekShare } from "@/lib/goals/share";
import type { GoalView } from "@/lib/goals/types";
import { dayParts } from "@/lib/time/zoned";
import { GoalRow } from "./GoalRow";
import { GoalTile } from "./GoalTile";

const STATUS_WORD: Record<WeekStatus, string> = { met: "met", missed: "missed", open: "open" };

function StatusMark({ status }: { status: WeekStatus }) {
  if (status === "met") return <Check className="size-2.5 text-success" strokeWidth={3} />;
  if (status === "missed") return <Close className="size-2.5 text-danger" strokeWidth={3} />;
  return <span aria-hidden className="block size-1.5 rounded-full border border-ink-3" />;
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
      className={`flex size-4 items-center justify-center rounded-[4px] border ${box} ${week.isCurrent ? "ring-[1.5px] ring-ink/70 ring-offset-1" : ""}`}
      title={`Week of ${day} ${month}: ${STATUS_WORD[week.status]}`}
    >
      <span className="sr-only">{`Week of ${day} ${month}${week.isCurrent ? " (this week)" : ""}: ${STATUS_WORD[week.status]}`}</span>
      <StatusMark status={week.status} />
    </li>
  );
}

type Props = {
  goal: GoalView;
  /** Opens the goal in the editor. */
  onOpen?: () => void;
  /** Only the header shows while collapsed. */
  collapsed?: boolean;
  /** Collapses or expands the section; without it there is no chevron. */
  onToggle?: () => void;
  /** The number of open tasks, shown small and grey at the right end of the header (spec 11). */
  openTasks?: number;
  /** Shown under the rules and weeks while the section is open: the goal's tasks (spec 11). */
  children?: ReactNode;
};

export function GoalCard({ goal, onOpen, collapsed = false, onToggle, openTasks, children }: Props) {
  const color = goalColor(goal.colorIndex);
  const passed = goal.progress.countdown === "Deadline passed";
  const share = weekShare(goal.progress.thisWeek);
  const bodyId = useId();
  const title = <span className="block min-w-0 truncate text-[15px] font-semibold tracking-snug text-ink">{goal.title}</span>;

  return (
    <article aria-label={goal.title} className="pb-4">
      <div className="flex min-h-9 items-center gap-1.5">
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            aria-label={`${collapsed ? "Expand" : "Collapse"} ${goal.title}`}
            title={collapsed ? "Expand" : "Collapse"}
            className="-ml-1 flex size-6 shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
          >
            <ChevronRight className={`size-3.5 transition-transform ${collapsed ? "" : "rotate-90"}`} strokeWidth={2.2} />
          </button>
        )}
        <GoalTile colorIndex={goal.colorIndex} />
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            className="ml-1 min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
            aria-label={`Edit goal ${goal.title}`}
          >
            {title}
          </button>
        ) : (
          <h3 className="ml-1 min-w-0 flex-1">{title}</h3>
        )}
        {openTasks !== undefined && <OpenTaskCount count={openTasks} />}
      </div>

      {/* The bar repeats the rows below in one line; screen readers read the rows. */}
      <div aria-hidden className="mt-1.5 h-[3px] rounded-full bg-muted">
        <div className={`h-full rounded-full ${color.dot}`} style={{ width: `${Math.round(share * 100)}%` }} />
      </div>

      {!collapsed && (
        <div id={bodyId} className="mt-2">
          {/* This week: the rule rows and the strip of weeks, one block. */}
          <ul className="flex flex-col">
            {goal.progress.thisWeek.map((rule) => (
              <GoalRow key={rule.ruleId} colorIndex={goal.colorIndex} done={rule.status === "met"} struck={rule.status === "met"} doneLabel="met" compact>
                {rule.text}
              </GoalRow>
            ))}
          </ul>

          <ol aria-label="Weeks" className="mt-2 flex flex-wrap gap-[5px] pl-[1px]">
            {goal.progress.weeks.map((week) => (
              <WeekCell key={week.monday} week={week} />
            ))}
          </ol>

          {children}
        </div>
      )}

      {/* The caption stays visible while the section is collapsed. */}
      <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[11px] text-ink-3">
        {passed ? (
          <span className="inline-flex h-5 items-center rounded-md bg-danger-soft px-1.5 font-semibold text-danger">{goal.progress.countdown}</span>
        ) : (
          <span className="tabular">{goal.progress.countdown}</span>
        )}
        {goal.autoBlock && (
          <>
            <span aria-hidden>·</span>
            <span>Auto-block on</span>
          </>
        )}
      </p>
    </article>
  );
}

/** The small grey number at the right end of a section's header: its open tasks. */
export function OpenTaskCount({ count }: { count: number }) {
  return (
    <span className="shrink-0 pl-1 text-[12px] text-ink-3 tabular">
      <span aria-hidden>{count}</span>
      <span className="sr-only">{count === 1 ? "1 open task" : `${count} open tasks`}</span>
    </span>
  );
}
