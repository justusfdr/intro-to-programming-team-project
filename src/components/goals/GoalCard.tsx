// One goal on the Goals page (R9, changed 18 Nov 2026; spec 39): a chevron that collapses it, the
// goal's tile and title with how far it is this week ("2/3"), a thin bar, one line per rule ("This
// week: 2 of 3 sessions"), one row with the 7 days of this week, and a caption with the countdown and
// "Auto-block on". Every goal looks the same, with or without an end date.
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
import type { StripDay, WeekStatus } from "@/lib/goals/progress";
import { routineTags } from "@/lib/goals/setup";
import { ruleNumbers, weekShare } from "@/lib/goals/share";
import type { GoalView } from "@/lib/goals/types";
import { fmtDayMonth } from "@/lib/time/display";
import { GoalTile } from "./GoalTile";

const DAY_LETTER = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAME = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type CircleColor = { dot: string; ring: string; text: string };

function dayWord(day: StripDay): string {
  if (day.done) return "done";
  if (day.missed) return "planned, not done";
  if (day.planned) return "planned";
  return "nothing planned";
}

/**
 * One day of this week (R9): its letter over a circle. Done: filled in the goal's colour with a white
 * check. Missed (a planned session on a day that has ended): a red cross. Planned (today or later):
 * a dashed ring in the goal's colour. Otherwise empty: a rest day is never a cross. Today is ringed.
 */
function DayCell({ day, index, color }: { day: StripDay; index: number; color: CircleColor }) {
  const said = `${DAY_NAME[index]}, ${fmtDayMonth(day.date)}${day.isToday ? " (today)" : ""}: ${dayWord(day)}`;
  const look = day.done
    ? `${color.dot} text-white`
    : day.missed
      ? "bg-danger-soft text-danger"
      : day.planned
        ? `border-[1.5px] border-dashed ${color.ring}`
        : "border-[1.5px] border-line";
  return (
    <li className="flex flex-col items-center gap-1" title={said}>
      <span aria-hidden className={`text-[10px] font-medium ${day.isToday ? "text-ink" : "text-ink-3"}`}>
        {DAY_LETTER[index]}
      </span>
      <span className={`flex size-6 items-center justify-center rounded-full ${look} ${day.isToday ? "ring-2 ring-ink/70 ring-offset-2" : ""}`}>
        <span className="sr-only">{said}</span>
        {day.done && <Check aria-hidden className="size-3.5" strokeWidth={3} />}
        {day.missed && <X aria-hidden className="size-3.5" strokeWidth={3} />}
      </span>
    </li>
  );
}

/**
 * One rule this week (R9): "This week: 2 of 3 sessions" or "This week: 1 of 6 h", the number done in
 * bold. A met rule is struck through with a check; screen readers hear "met".
 */
function RuleLine({ text, status, color }: { text: string; status: WeekStatus; color: CircleColor }) {
  const met = status === "met";
  const numbers = ruleNumbers(text);
  const unit = numbers?.hours ? "h" : numbers?.target === "1" ? "session" : "sessions";
  return (
    <li className="py-0.5">
      <span className={`flex items-center gap-1.5 text-[13px] ${met ? "text-ink-3" : "text-ink-2"}`}>
        <span className={met ? "line-through" : undefined}>
          {numbers ? (
            <>
              This week: <strong className={`font-semibold ${met ? "" : "text-ink"}`}>{numbers.amount}</strong> of {numbers.target} {unit}
            </>
          ) : (
            text
          )}
        </span>
        {met && <span className="sr-only">, met</span>}
        {met && <Check aria-hidden className={`size-3 ${color.text}`} strokeWidth={3} />}
      </span>
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
  /** Shown under the rules and days while the section is open: the goal's tasks (spec 11). */
  children?: ReactNode;
};

export function GoalCard({ goal, onOpen, collapsed = false, onToggle, openTasks, children }: Props) {
  const color = goalColor(goal.look.color);
  const passed = goal.progress.countdown === "Deadline passed";
  const share = weekShare(goal.progress.thisWeek);
  const onlyRule = goal.progress.thisWeek.length === 1 ? ruleNumbers(goal.progress.thisWeek[0].text) : null;
  const headline = onlyRule ? `${onlyRule.amount}/${onlyRule.target}${onlyRule.hours ? " h" : ""}` : null;
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
        {/* A goal with one rule shows how far it is at the right of the title, also while collapsed. */}
        {headline && (
          <span aria-hidden className={`shrink-0 pl-1 text-[13px] font-semibold tabular ${color.text}`}>
            {headline}
          </span>
        )}
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
          {/* This week: one line per rule, then the 7 days of this week (R9). */}
          <ul aria-label="This week" className="mb-2 flex flex-col gap-1">
            {goal.progress.thisWeek.map((rule) => (
              <RuleLine key={rule.ruleId} text={rule.text} status={rule.status} color={color} />
            ))}
          </ul>

          {goal.progress.days && (
            <ol aria-label="Days this week" className="mb-3 flex justify-between gap-1 px-[2px] pt-0.5">
              {goal.progress.days.map((day, i) => (
                <DayCell key={day.date} day={day} index={i} color={color} />
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
