// "Reach" (spec 45): two goals as the Goals page shows them: this week's sessions, the strip of
// weeks and the countdown. A finished session comes in, and the thesis goes from 2 to 3 of 4.
import { Check, X } from "lucide-react";
import { GoalTile } from "@/components/goals/GoalTile";
import { goalColor } from "@/lib/goals/colors";
import type { GoalLook } from "@/lib/goals/style";
import { timing } from "./parts";

/** When the finished session is counted, in milliseconds after the scene starts. */
const COUNTED = 1350;

type Week = "met" | "missed" | "open" | "now";

type Goal = {
  title: string;
  look: GoalLook;
  /** "sessions" or "runs". */
  unit: string;
  planned: number;
  done: number;
  /** One more gets counted while you watch. */
  gains: boolean;
  weeks: Week[];
  caption: string;
};

const GOALS: Goal[] = [
  {
    title: "Master's thesis",
    look: { color: "indigo", icon: "graduation" },
    unit: "sessions",
    planned: 4,
    done: 3,
    gains: true,
    weeks: ["met", "met", "missed", "met", "met", "now", "open", "open", "open", "open"],
    caption: "32 days left · Auto-block on",
  },
  {
    title: "Half marathon",
    look: { color: "teal", icon: "footprints" },
    unit: "runs",
    planned: 3,
    done: 2,
    gains: false,
    weeks: ["met", "missed", "met", "met", "met", "now", "open", "open", "open", "open", "open", "open"],
    caption: "61 days left",
  },
];

const STATS = [
  { label: "Focused this week", value: "7 h 40 min" },
  { label: "Focus score", value: "86" },
  { label: "Blocked attempts", value: "14" },
];

function WeekCell({ week }: { week: Week }) {
  const box =
    week === "met" ? "border-success/40 bg-success-soft" : week === "missed" ? "border-danger/40 bg-danger-soft" : "border-line bg-surface";
  return (
    <span className={`flex size-4 items-center justify-center rounded-[4px] border ${box} ${week === "now" ? "ring-[1.5px] ring-ink/70 ring-offset-1" : ""}`}>
      {week === "met" && <Check className="size-2.5 text-success" strokeWidth={3} />}
      {week === "missed" && <X className="size-2.5 text-danger" strokeWidth={3} />}
      {(week === "open" || week === "now") && <span className="block size-1.5 rounded-full border border-ink-3" />}
    </span>
  );
}

/** One planned session of this week: a ring while open, the goal's colour with a tick when done. */
function Mark({ done, fresh, dot, ring }: { done: boolean; fresh: boolean; dot: string; ring: string }) {
  const open = <span className={`block size-[18px] rounded-full border-[1.5px] ${ring}`} />;
  const filled = (
    <span className={`flex size-[18px] items-center justify-center rounded-full text-white ${dot}`}>
      <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 6.2 5 8.6 9.5 3.6" pathLength={1} className={fresh ? "l-draw" : ""} style={fresh ? timing({ d: COUNTED + 160 }) : undefined} />
      </svg>
    </span>
  );
  if (!done) return open;
  if (!fresh) return filled;
  return (
    <span className="grid">
      <span className="l-leave col-start-1 row-start-1" style={timing({ out: COUNTED })}>
        {open}
      </span>
      <span className="l-pop col-start-1 row-start-1" style={timing({ d: COUNTED })}>
        {filled}
      </span>
    </span>
  );
}

function GoalBlock({ goal }: { goal: Goal }) {
  const color = goalColor(goal.look.color);
  const before = goal.gains ? goal.done - 1 : goal.done;
  return (
    <div className="py-3.5 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2.5">
        <GoalTile look={goal.look} />
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-snug text-ink">{goal.title}</span>
        <span className="flex shrink-0 gap-1">
          {Array.from({ length: goal.planned }, (_, index) => (
            <Mark key={index} done={index < goal.done} fresh={goal.gains && index === goal.done - 1} dot={color.dot} ring={color.ring} />
          ))}
        </span>
      </div>

      <div className="mt-2.5 h-[3px] overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${color.dot} ${goal.gains ? "l-grow" : ""}`}
          style={{ width: `${Math.round((goal.done / goal.planned) * 100)}%`, ...(goal.gains ? timing({ d: COUNTED, from: before / goal.done }) : {}) }}
        />
      </div>

      <p className="mt-2 flex items-center gap-1 text-[12px] text-ink-2">
        This week:
        {goal.gains ? (
          <span className="grid w-2 justify-items-center font-semibold text-ink tabular">
            <span className="l-leave col-start-1 row-start-1" style={timing({ out: COUNTED })}>
              {before}
            </span>
            <span className="l-pop col-start-1 row-start-1" style={timing({ d: COUNTED })}>
              {goal.done}
            </span>
          </span>
        ) : (
          <span className="font-semibold text-ink tabular">{goal.done}</span>
        )}
        {`of ${goal.planned} ${goal.unit}`}
      </p>

      <div className="mt-2 flex flex-wrap gap-[5px] pl-px">
        {goal.weeks.map((week, index) => (
          <WeekCell key={index} week={week} />
        ))}
      </div>
      <p className="mt-2 text-[11px] text-ink-3 tabular">{goal.caption}</p>
    </div>
  );
}

export function GoalsMock() {
  return (
    <div
      role="img"
      aria-label="Two goals. The thesis has 3 of 4 sessions done this week and 32 days left, the half marathon 2 of 3 runs and 61 days left. Below: 7 hours 40 minutes focused this week, a focus score of 86 and 14 blocked attempts."
      className="w-full max-w-[440px]"
    >
      <div aria-hidden className="flex flex-col gap-3">
        <div className="l-rise ml-auto flex h-10 items-center gap-2 rounded-full border border-line-subtle bg-surface pl-2 pr-3.5 text-[13px] shadow-float" style={timing({ d: 300 })}>
          <span className="flex size-6 items-center justify-center rounded-full bg-success-soft text-success">
            <Check className="size-3.5" strokeWidth={3} />
          </span>
          <span className="font-medium text-ink">Session finished</span>
          <span className="text-ink-3 tabular">1 h 30 min</span>
        </div>

        <div className="l-rise divide-y divide-line-subtle rounded-card border border-line-subtle bg-surface p-4 shadow-float" style={timing({ d: 120 })}>
          {GOALS.map((goal) => (
            <GoalBlock key={goal.title} goal={goal} />
          ))}
        </div>

        <div className="l-rise grid grid-cols-3 divide-x divide-line-subtle rounded-card border border-line-subtle bg-surface py-3 shadow-float" style={timing({ d: COUNTED + 300 })}>
          {STATS.map((stat) => (
            <div key={stat.label} className="px-3 sm:px-4">
              <p className="text-[11px] leading-[14px] text-ink-3">{stat.label}</p>
              <p className="mt-1 text-[15px] font-semibold tracking-snug text-ink tabular">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
