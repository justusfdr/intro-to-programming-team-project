// The hero's graphic (spec 45): the week view with lectures and meetings already in it. The coach's
// suggestions appear dashed in the free hours, then lock in as real blocks in their goal's colour.
// On phones only the three middle days show, and all four suggestions are on those days.
import { CalendarDays, ChartColumn, Check, MessageCircle, Target, Timer } from "lucide-react";
import { LogoMark } from "@/components/shell/Logo";
import { goalColor } from "@/lib/goals/colors";
import type { GoalColorName } from "@/lib/goals/style";
import { at, clock, Dots, hourLabel, timing } from "./parts";

/** Pixels per hour, and the hours on show. */
const ROW = 46;
const FIRST = 8;
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15];
const NOW = at(10, 10);

const DAYS = [
  { name: "Mon", date: 16 },
  { name: "Tue", date: 17 },
  { name: "Wed", date: 18 },
  { name: "Thu", date: 19 },
  { name: "Fri", date: 20 },
];
const TODAY = 1;

/** When the suggestions come in, and when they lock (milliseconds after the page shows). */
const SUGGEST_AT = 1200;
const LOCK_AT = 2900;

type Block = {
  day: number;
  from: number;
  to: number;
  title: string;
  /** The goal's colour; null for an event without a goal. */
  color: GoalColorName | null;
  /** A suggestion of the coach: its place in the order they appear. */
  step?: number;
};

const BLOCKS: Block[] = [
  { day: 0, from: at(9), to: at(10, 30), title: "Statistics lecture", color: null },
  { day: 0, from: at(12), to: at(13), title: "Easy run", color: "teal" },
  { day: 0, from: at(13, 30), to: at(14, 30), title: "Portuguese", color: "amber" },
  { day: 1, from: at(9), to: at(9, 45), title: "Team sync", color: null },
  { day: 1, from: at(10, 30), to: at(12, 30), title: "Thesis: chapter 2", color: "indigo", step: 0 },
  { day: 1, from: at(13), to: at(14), title: "Lunch", color: null },
  { day: 2, from: at(9), to: at(10, 30), title: "Finance lecture", color: null },
  { day: 2, from: at(11), to: at(12, 30), title: "Thesis: sources", color: "indigo", step: 1 },
  { day: 2, from: at(13), to: at(14), title: "Intervals", color: "teal" },
  { day: 3, from: at(9), to: at(11), title: "Thesis: chapter 3", color: "indigo", step: 2 },
  { day: 3, from: at(11, 15), to: at(12, 30), title: "Group project", color: null },
  { day: 3, from: at(13), to: at(14), title: "Tempo run", color: "teal", step: 3 },
  { day: 4, from: at(9), to: at(10, 30), title: "Statistics lecture", color: null },
  { day: 4, from: at(11), to: at(12, 30), title: "Thesis: review", color: "indigo" },
];
const SUGGESTIONS = BLOCKS.filter((block) => block.step !== undefined).length;

const NAV = [CalendarDays, Target, MessageCircle, Timer, ChartColumn];

/** Monday and Friday make room on a phone. */
function edge(day: number): boolean {
  return day === 0 || day === DAYS.length - 1;
}

function px(minutes: number): number {
  return ((minutes - FIRST * 60) / 60) * ROW;
}

function BlockBox({ block }: { block: Block }) {
  const top = px(block.from);
  const height = px(block.to) - top - 2;
  const colors = block.color ? goalColor(block.color).block : "border-line bg-raised text-ink";
  const box = "absolute inset-x-[2px] overflow-hidden rounded-lg border px-1.5 py-1";
  const text = (
    <>
      {/* Whole words on two lines when the block is high enough, as in the calendar. */}
      <span className={`block text-[11px] font-medium leading-[14px] ${height >= 60 ? "line-clamp-2" : "truncate"}`}>{block.title}</span>
      {height >= 44 && <span className="block truncate text-[10px] leading-[13px] tabular opacity-80">{`${clock(block.from)} – ${clock(block.to)}`}</span>}
    </>
  );
  if (block.step === undefined) {
    return (
      <div className={`${box} ${colors}`} style={{ top, height }}>
        {text}
      </div>
    );
  }
  const suggestAt = SUGGEST_AT + block.step * 170;
  const lockAt = LOCK_AT + block.step * 150;
  return (
    <>
      <div className={`l-ghost ${box} border-2 border-dashed border-ink/25 bg-ink/[0.04] text-ink-2`} style={{ top, height, ...timing({ d: suggestAt, out: lockAt }) }}>
        {text}
      </div>
      <div className={`l-lock ${box} shadow-float ${colors}`} style={{ top, height, ...timing({ d: lockAt }) }}>
        {text}
      </div>
    </>
  );
}

export function WeekMock() {
  const done = LOCK_AT + SUGGESTIONS * 150;
  return (
    <div
      role="img"
      aria-label={`The week view of the calendar. The coach adds ${SUGGESTIONS} focus blocks for the thesis and a run in the free hours between lectures and meetings.`}
      className="relative pb-6"
    >
      <div aria-hidden className="flex overflow-hidden rounded-panel border border-line-subtle bg-surface shadow-pop">
        {/* The app's sidebar, folded. */}
        <div className="hidden w-[52px] shrink-0 flex-col items-center gap-1 border-r border-line-subtle bg-canvas py-3.5 sm:flex">
          <LogoMark className="mb-3 size-7 rounded-[9px]" />
          {NAV.map((Icon, index) => (
            <span key={index} className={`flex size-9 items-center justify-center rounded-lg ${index === 0 ? "bg-raised text-ink" : "text-ink-3"}`}>
              <Icon className="size-[18px]" strokeWidth={index === 0 ? 2.2 : 1.8} />
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex h-12 items-center justify-between gap-3 border-b border-line-subtle px-4">
            <span className="text-[15px] font-semibold tracking-snug text-ink">November 2026</span>
            <span className="flex items-center rounded-full bg-raised p-0.5 text-[11px] font-medium text-ink-2">
              <span className="px-2.5 py-1">Day</span>
              <span className="rounded-full bg-surface px-2.5 py-1 text-ink shadow-float">Week</span>
              <span className="px-2.5 py-1">Month</span>
            </span>
          </div>

          <div className="flex border-b border-line-subtle">
            <div className="w-10 shrink-0" />
            {DAYS.map((day, index) => (
              <div key={day.name} className={`${edge(index) ? "hidden sm:flex" : "flex"} min-w-0 flex-1 flex-col items-center gap-0.5 py-2`}>
                <span className="text-[11px] font-medium text-ink-3">{day.name}</span>
                <span className={`flex size-7 items-center justify-center rounded-full text-sm font-semibold tabular ${index === TODAY ? "bg-today text-white" : "text-ink"}`}>
                  {day.date}
                </span>
              </div>
            ))}
          </div>

          <div className="relative flex" style={{ height: HOURS.length * ROW }}>
            <div className="relative w-10 shrink-0">
              {HOURS.slice(1).map((hour) => (
                <span key={hour} className="absolute right-1.5 text-[10px] tabular text-ink-3" style={{ top: px(hour * 60) + 2 }}>
                  {hourLabel(hour)}
                </span>
              ))}
            </div>
            {DAYS.map((day, index) => (
              <div key={day.name} className={`${edge(index) ? "hidden sm:block" : ""} relative min-w-0 flex-1 border-l border-line-subtle`}>
                {HOURS.slice(1).map((hour) => (
                  <div key={hour} className="absolute inset-x-0 border-t border-line-subtle" style={{ top: px(hour * 60) }} />
                ))}
                {BLOCKS.filter((block) => block.day === index).map((block) => (
                  <BlockBox key={block.title + block.from} block={block} />
                ))}
                {index === TODAY && (
                  <div className="absolute inset-x-0 z-[3] h-px bg-today" style={{ top: px(NOW) }}>
                    <span className="l-now absolute -left-[3px] -top-[3px] size-[7px] rounded-full bg-today" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* What the coach is doing, on top of the window's lower edge. */}
      <div
        aria-hidden
        className="l-rise absolute bottom-0 left-1/2 flex h-11 -translate-x-1/2 items-center gap-2.5 whitespace-nowrap rounded-full border border-line-subtle bg-surface pl-2 pr-4 text-[13px] font-medium shadow-pop"
        style={timing({ d: 900 })}
      >
        <LogoMark className="size-7 rounded-full" />
        <span className="grid">
          <span className="l-ghost col-start-1 row-start-1 flex items-center gap-2 text-ink-2" style={timing({ d: 900, out: done })}>
            Planning your week
            <Dots />
          </span>
          <span className="l-pop col-start-1 row-start-1 flex items-center gap-1.5 text-ink" style={timing({ d: done + 120 })}>
            <Check className="size-3.5 text-success" strokeWidth={3} />
            {`${SUGGESTIONS} focus blocks added to your week`}
          </span>
        </span>
      </div>
    </div>
  );
}
