// "Plan" (spec 45): a short chat with the coach. The user says what tomorrow needs, the coach thinks,
// answers with a draft for the day, and "Add to calendar" turns the draft into real events.
import { Check, Footprints, GraduationCap, type LucideIcon } from "lucide-react";
import { LogoMark } from "@/components/shell/Logo";
import { buttonClass } from "@/components/ui/Button";
import { goalColor } from "@/lib/goals/colors";
import type { GoalColorName } from "@/lib/goals/style";
import { at, clock, Dots, hourLabel, timing } from "./parts";

const ROW = 38;
const FIRST = 9;
const HOURS = [9, 10, 11, 12, 13];

/** The moments of the scene, in milliseconds after it starts. */
const THINK = 700;
const ANSWER = 2000;
const DRAFT = 2400;
const PRESS = 4500;
const ADDED = 4760;

type Proposal = { from: number; to: number; title: string; color: GoalColorName; icon: LucideIcon };
const PROPOSALS: Proposal[] = [
  { from: at(9), to: at(11), title: "Thesis: chapter 3", color: "indigo", icon: GraduationCap },
  { from: at(13), to: at(14), title: "Tempo run", color: "teal", icon: Footprints },
];
/** Already in the calendar; the draft plans around it. */
const EXISTING = { from: at(11, 15), to: at(12, 30), title: "Group project" };

function px(minutes: number): number {
  return ((minutes - FIRST * 60) / 60) * ROW;
}

export function CoachMock() {
  return (
    <div
      role="img"
      aria-label="A chat with the coach. Asked for two hours of thesis work and a run tomorrow, it drafts both around the group project, and one click adds them to the calendar."
      className="w-full max-w-[440px]"
    >
      <div aria-hidden className="flex flex-col gap-4">
        <p className="l-rise ml-auto max-w-[86%] rounded-[20px] border border-line-subtle bg-surface px-4 py-2.5 text-[14px] leading-[22px] text-ink" style={timing({ d: 150 })}>
          Tomorrow I need two hours for my thesis and a run. Group project is at 11:15.
        </p>

        <div className="flex gap-3">
          <span className="l-pop mt-0.5 shrink-0" style={timing({ d: THINK - 100 })}>
            <LogoMark className="size-7 rounded-full" />
          </span>
          <div className="grid min-w-0 flex-1">
            <span className="l-ghost col-start-1 row-start-1 flex h-7 items-center gap-2 text-[14px] text-ink-3" style={timing({ d: THINK, out: ANSWER - 80 })}>
              Thinking
              <Dots />
            </span>
            <p className="l-pop col-start-1 row-start-1 origin-left pt-0.5 text-[14px] leading-[22px] text-ink" style={timing({ d: ANSWER })}>
              Here is a draft for Thursday: the thesis first, while you are fresh, and your run after the group project.
            </p>
          </div>
        </div>

        <div className="l-rise ml-10 overflow-hidden rounded-card border border-line-subtle bg-surface shadow-float" style={timing({ d: DRAFT })}>
          <div className="flex items-center justify-between gap-2 px-3 pt-3">
            <span className="text-sm font-semibold tracking-snug text-ink">Draft for Thu 19 Nov</span>
            <span className="grid text-[11px] font-semibold">
              <span className="l-leave col-start-1 row-start-1 justify-self-end rounded-full bg-raised px-2 py-0.5 text-ink-2" style={timing({ out: ADDED })}>
                Draft
              </span>
              <span className="l-pop col-start-1 row-start-1 justify-self-end rounded-full bg-success-soft px-2 py-0.5 text-success" style={timing({ d: ADDED + 80 })}>
                Added
              </span>
            </span>
          </div>

          <div className="flex px-3 pt-2">
            <div className="relative w-11 shrink-0" style={{ height: HOURS.length * ROW }}>
              {HOURS.map((hour) => (
                <span key={hour} className="absolute right-2 text-[10px] tabular text-ink-3" style={{ top: px(hour * 60) + 1 }}>
                  {hourLabel(hour)}
                </span>
              ))}
            </div>
            <div className="relative min-w-0 flex-1 border-l border-line-subtle">
              {HOURS.map((hour) => (
                <div key={hour} className="absolute inset-x-0 border-t border-line-subtle" style={{ top: px(hour * 60) }} />
              ))}
              <div
                className="absolute left-1 right-6 overflow-hidden rounded-lg border border-dashed border-line bg-canvas/80 px-1.5 py-0.5 text-ink-3"
                style={{ top: px(EXISTING.from), height: px(EXISTING.to) - px(EXISTING.from) - 2 }}
              >
                <span className="block truncate text-[10px] font-medium leading-[13px]">{EXISTING.title}</span>
                <span className="block truncate text-[10px] leading-[13px] tabular">{`${clock(EXISTING.from)} – ${clock(EXISTING.to)}`}</span>
              </div>
              {PROPOSALS.map((block, index) => (
                <div
                  key={block.title}
                  className={`l-pop absolute left-1 right-6 origin-top overflow-hidden rounded-lg border px-1.5 py-0.5 shadow-float ${goalColor(block.color).block}`}
                  style={{ top: px(block.from), height: px(block.to) - px(block.from) - 2, ...timing({ d: DRAFT + 380 + index * 200 }) }}
                >
                  <span className="flex items-center gap-1 text-[11px] font-medium leading-[14px]">
                    <block.icon className="size-3 shrink-0" />
                    <span className="truncate">{block.title}</span>
                  </span>
                  <span className="block truncate text-[10px] leading-[13px] tabular opacity-80">{`${clock(block.from)} – ${clock(block.to)}`}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid border-t border-line-subtle p-3">
            <span className="l-leave col-start-1 row-start-1 flex items-center gap-2" style={timing({ out: ADDED })}>
              <span className={`l-press ${buttonClass("primary", "sm")}`} style={timing({ d: PRESS })}>
                Add to calendar
              </span>
              <span className={buttonClass("ghost", "sm")}>Discard</span>
            </span>
            <span className="l-pop col-start-1 row-start-1 flex h-8 items-center gap-2 text-[13px] text-ink-2" style={timing({ d: ADDED + 80 })}>
              <span className="flex size-[18px] items-center justify-center rounded-full bg-ink text-white">
                <Check className="size-3" strokeWidth={3} />
              </span>
              <span className="font-medium text-ink">2 events added</span>
              <span className="ml-auto underline underline-offset-2">Undo</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
