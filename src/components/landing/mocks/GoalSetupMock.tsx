// "Goal" (spec 62): a new goal takes shape. The six questions of the goal setup are answered one
// after the other, then the goal they make appears, as the Goals page shows it. Decoration: what it
// shows stands in the words next to it.
import { Check } from "lucide-react";
import { GoalTile } from "@/components/goals/GoalTile";
import { goalColor } from "@/lib/goals/colors";
import { timing } from "./parts";

/** The six questions and this goal's answers, in the order the setup asks them. */
const ANSWERS = [
  { label: "What kind", value: "Uni" },
  { label: "How often, how long", value: "4 sessions a week, 2 h" },
  { label: "Where", value: "At home or anywhere" },
  { label: "Time of day", value: "Morning" },
  { label: "Never on", value: "Sunday" },
  { label: "Is there a date", value: "Yes, 21 December" },
];

/** When the first answer lands, and how long until the next, in milliseconds after the scene starts. */
const FIRST = 450;
const EACH = 360;
const CREATED = FIRST + ANSWERS.length * EACH + 250;

export function GoalSetupMock() {
  const color = goalColor("indigo");
  return (
    <div aria-hidden className="flex w-full max-w-[440px] flex-col gap-3">
      <div className="l-rise rounded-card border border-line-subtle bg-surface p-4 shadow-float sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-semibold tracking-snug text-ink-2">New goal</span>
          {/* The setup's progress: one bar for each question. */}
          <span className="flex gap-1">
            {ANSWERS.map((answer, index) => (
              <span key={answer.label} className="h-1 w-5 overflow-hidden rounded-full bg-muted">
                <span className="l-grow block h-full rounded-full bg-ink" style={timing({ d: FIRST + index * EACH })} />
              </span>
            ))}
          </span>
        </div>
        <p className="mt-2.5 text-[22px] leading-7 font-semibold tracking-heading text-ink">Master&apos;s thesis</p>

        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
          {ANSWERS.map((answer, index) => (
            <div key={answer.label} className="l-pop min-w-0 origin-left" style={timing({ d: FIRST + index * EACH })}>
              <p className="text-[11px] leading-[14px] text-ink-3">{answer.label}</p>
              <p className="mt-1 inline-flex h-7 max-w-full items-center rounded-full border border-line-subtle bg-canvas px-2.5 text-[12px] font-medium text-ink">
                <span className="truncate">{answer.value}</span>
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="l-rise ml-auto flex h-10 items-center gap-2 rounded-full border border-line-subtle bg-surface pl-2 pr-3.5 text-[13px] shadow-float" style={timing({ d: CREATED })}>
        <span className="flex size-6 items-center justify-center rounded-full bg-success-soft text-success">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
        <span className="font-medium text-ink">Goal created</span>
      </div>

      <div className="l-rise rounded-card border border-line-subtle bg-surface p-4 shadow-float" style={timing({ d: CREATED + 160 })}>
        <div className="flex items-center gap-2.5">
          <GoalTile look={{ color: "indigo", icon: "graduation" }} />
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-snug text-ink">Master&apos;s thesis</span>
          <span className="flex shrink-0 gap-1">
            {[0, 1, 2, 3].map((session) => (
              <span key={session} className={`block size-[18px] rounded-full border-[1.5px] ${color.ring}`} />
            ))}
          </span>
        </div>
        <div className="mt-2.5 h-[3px] rounded-full bg-muted" />
        <p className="mt-2 text-[12px] text-ink-2">
          This week: <span className="font-semibold text-ink tabular">0</span> of 4 sessions
        </p>
        <p className="mt-1.5 text-[11px] text-ink-3 tabular">32 days left · Auto-block on</p>
      </div>
    </div>
  );
}
