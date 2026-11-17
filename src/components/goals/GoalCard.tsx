// One goal on the Goals page (R9; spec 39, before in the goals column): a chevron that
// collapses it, the goal's tile and title, a thin bar for how far this week's rules
// are, one line per rule ("This week: 1 of 2 done") with a circle per session or hour (at the right
// of the title when the goal has one rule), the strip of weeks, and a caption with the countdown and
// "Auto-block on".
// Every status is said in words and shown with a symbol, so nothing depends on colour alone.
// Spec 42: a goal with a routine shows it as one quiet line of tags under the title (only what is set,
// its category's name first); a goal without one looks exactly as before.
// Spec 43: the caption ends with a quiet link "Plan with coach" to /coach?plan=<goal id>.
import Link from "next/link";
import { useId, type ReactNode } from "react";
import { Check, ChevronRight, X } from "lucide-react";
import { useDisplay } from "@/components/shell/DisplayProvider";
import { planGoalHref } from "@/lib/chat/plan-goal";
import { goalColor } from "@/lib/goals/colors";
import type { StripDay, StripWeek, WeekStatus } from "@/lib/goals/progress";
import { routineTags } from "@/lib/goals/setup";
import { ruleCircles, weekShare } from "@/lib/goals/share";
import type { GoalView } from "@/lib/goals/types";
import { fmtDayMonth } from "@/lib/time/display";
import { GoalTile } from "./GoalTile";

const STATUS_WORD: Record<WeekStatus, string> = { met: "met", missed: "missed", open: "open" };

function StatusMark({ status }: { status: WeekStatus }) {
  if (status === "met") return <Check className="size-3 text-success" strokeWidth={3} />;
  if (status === "missed") return <X className="size-3 text-danger" strokeWidth={3} />;
  return <span aria-hidden className="block size-[7px] rounded-full border-[1.5px] border-ink-3" />;
}

/** One week of the strip (R9): a rounded box with a check, a cross or a small ring; this week framed. */
function WeekCell({ week }: { week: StripWeek }) {
  const date = fmtDayMonth(week.monday);
  const box =
    week.status === "met"
      ? "border-success/40 bg-success-soft"
      : week.status === "missed"
        ? "border-danger/40 bg-danger-soft"
        : "border-line bg-surface";
  return (
    <li
      className={`flex size-[22px] items-center justify-center rounded-md border ${box} ${week.isCurrent ? "ring-2 ring-ink/70 ring-offset-1" : ""}`}
      title={`Week of ${date}: ${STATUS_WORD[week.status]}`}
    >
      <span className="sr-only">{`Week of ${date}${week.isCurrent ? " (this week)" : ""}: ${STATUS_WORD[week.status]}`}</span>
      <StatusMark status={week.status} />
    </li>
  );
}

const DAY_LETTER = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAME = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * One day of this week (R9, a goal without an end date): its letter over a box with a check when a
 * session was done that day; today framed. A day without a session stays empty, never a cross.
 */
function DayCell({ day, index }: { day: StripDay; index: number }) {
  const said = `${DAY_NAME[index]}, ${fmtDayMonth(day.date)}${day.isToday ? " (today)" : ""}: ${day.done ? "done" : "no session"}`;
  return (
    <li className="flex flex-col items-center gap-1" title={said}>
      <span aria-hidden className={`text-[10px] font-medium ${day.isToday ? "text-ink" : "text-ink-3"}`}>
        {DAY_LETTER[index]}
      </span>
      <span
        className={`flex size-[22px] items-center justify-center rounded-md border ${day.done ? "border-success/40 bg-success-soft" : "border-line bg-surface"} ${day.isToday ? "ring-2 ring-ink/70 ring-offset-1" : ""}`}
      >
        <span className="sr-only">{said}</span>
        {day.done && <Check aria-hidden className="size-3 text-success" strokeWidth={3} />}
      </span>
    </li>
  );
}

type CircleColor = { dot: string; ring: string; text: string };

/**
 * This week's circles of one rule (R9): one per session or per hour. A done one is filled in the
 * goal's colour with a white check; a part of an hour fills its circle partly; an open one is a ring.
 * Only a picture: the rule's words say the same, and screen readers read those.
 */
function Circles({ text, status, color, className = "" }: { text: string; status: WeekStatus; color: CircleColor; className?: string }) {
  const circles = ruleCircles({ text, status });
  if (!circles) return null;
  const unit = /\bh$/.test(text) ? "hour" : "session";
  return (
    <span aria-hidden title={`1 circle = 1 ${unit}`} className={`flex flex-wrap gap-1 ${className}`}>
      {circles.map((full, i) => (
        <span key={i} className={`relative flex size-[18px] shrink-0 items-center justify-center overflow-hidden rounded-full border-[1.5px] ${color.ring}`}>
          <span className={`absolute inset-y-0 left-0 ${color.dot}`} style={{ width: `${Math.round(full * 100)}%` }} />
          {full === 1 && <Check className="relative size-2.5 text-white" strokeWidth={3.5} />}
        </span>
      ))}
    </span>
  );
}

/**
 * One rule this week (R9): its words ("This week: 2 of 6 done"), with its circles under them unless
 * the header already shows them. A met rule is struck through with a check; screen readers hear "met".
 */
function RuleLine({ text, status, color, circles }: { text: string; status: WeekStatus; color: CircleColor; circles: boolean }) {
  const met = status === "met";
  return (
    <li className="flex flex-col gap-1.5 py-0.5">
      <span className={`flex items-center gap-1.5 text-[13px] ${met ? "text-ink-3" : "text-ink-2"}`}>
        <span className={met ? "line-through" : undefined}>{text}</span>
        {met && <span className="sr-only">, met</span>}
        {met && <Check aria-hidden className={`size-3 ${color.text}`} strokeWidth={3} />}
      </span>
      {circles && <Circles text={text} status={status} color={color} />}
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
  const color = goalColor(goal.look.color);
  const passed = goal.progress.countdown === "Deadline passed";
  const share = weekShare(goal.progress.thisWeek);
  const onlyRule = goal.progress.thisWeek.length === 1 ? goal.progress.thisWeek[0] : null;
  const bodyId = useId();
  const { timeFormat } = useDisplay();
  const tags = goal.routine ? routineTags({ routine: goal.routine, withCategory: true }, timeFormat) : [];
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
        <GoalTile look={goal.look} />
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
        {/* A goal with one rule shows its circles at the right of the title, also while collapsed. */}
        {onlyRule && <Circles text={onlyRule.text} status={onlyRule.status} color={color} className="shrink-0 justify-end" />}
        {openTasks !== undefined && <OpenTaskCount count={openTasks} />}
      </div>

      {tags.length > 0 && (
        <ul aria-label={`Routine of ${goal.title}`} className="mt-1 flex flex-wrap gap-1">
          {tags.map((tag) => (
            <li key={tag.key} className="inline-flex h-5 max-w-full items-center rounded-md bg-raised px-1.5 text-[11px] text-ink-2">
              <span aria-hidden className="truncate">
                {tag.text}
              </span>
              <span className="sr-only">{tag.label}</span>
            </li>
          ))}
        </ul>
      )}

      {/* The bar repeats the rows below in one line; screen readers read the rows. */}
      <div aria-hidden className="mt-2 h-1 rounded-full bg-muted">
        <div className={`h-full rounded-full ${color.dot}`} style={{ width: `${Math.round(share * 100)}%` }} />
      </div>

      {!collapsed && (
        <div id={bodyId} className="mt-2">
          {/* This week: one line per rule (its circles at the title, or under it), then the strip of weeks. */}
          <ul aria-label="This week" className="mb-2 flex flex-col gap-1.5">
            {goal.progress.thisWeek.map((rule) => (
              <RuleLine key={rule.ruleId} text={rule.text} status={rule.status} color={color} circles={!onlyRule} />
            ))}
          </ul>

          {goal.deadline === null && goal.progress.days ? (
            // No end date: this week's days, Monday to Sunday (R9).
            <ol aria-label="Days this week" className="mb-3 flex gap-2 pl-[2px]">
              {goal.progress.days.map((day, i) => (
                <DayCell key={day.date} day={day} index={i} />
              ))}
            </ol>
          ) : (
            <ol aria-label="Weeks" className="mb-3 flex flex-wrap gap-2 pl-[2px] pt-0.5">
              {goal.progress.weeks.map((week) => (
                <WeekCell key={week.monday} week={week} />
              ))}
            </ol>
          )}

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
        <span aria-hidden>·</span>
        <Link
          href={planGoalHref(goal.id)}
          aria-label={`Plan ${goal.title} with the coach`}
          className="rounded-sm text-ink-3 underline-offset-2 transition-colors hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
        >
          Plan with coach
        </Link>
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
