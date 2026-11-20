// The day under "How it works" (spec 62): six stops, from a new goal in the morning to the numbers
// in the evening. On a large screen the stage stays in place while scrolling and a red line walks
// through the day on its left (StoryScroll.tsx, landing.css). Everywhere else the stops stand one
// under the other, words first and then the picture, as the three steps of spec 45 did.
import type { ReactNode } from "react";
import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { goalColor } from "@/lib/goals/colors";
import type { GoalColorName } from "@/lib/goals/style";
import { clockText } from "@/lib/landing/story";
import { STORY, STORY_DAY, type Stop } from "./content";
import { Eyebrow } from "./Eyebrow";
import { CoachMock } from "./mocks/CoachMock";
import { FocusMock } from "./mocks/FocusMock";
import { GoalSetupMock } from "./mocks/GoalSetupMock";
import { GoalsMock } from "./mocks/GoalsMock";
import { at, clock, hourLabel, Stage, timing } from "./mocks/parts";
import { ReportMock } from "./mocks/ReportMock";
import { TravelMock } from "./mocks/TravelMock";
import { StoryScroll } from "./StoryScroll";

const PICTURES: Record<Stop["id"], ReactNode> = {
  goal: <GoalSetupMock />,
  plan: <CoachMock />,
  focus: <FocusMock />,
  travel: <TravelMock />,
  reach: <GoalsMock />,
  report: <ReportMock />,
};

type DayBlock = {
  from: number;
  to: number;
  title: string;
  /** The goal's colour; null for an event without a goal. */
  color: GoalColorName | null;
  /** When the coach suggests it, and when it is added to the calendar. Without these it is there all day. */
  suggested?: number;
  added?: number;
};

/** The events of the day. The thesis and the run only arrive when the coach has planned them. */
const BLOCKS: DayBlock[] = [
  { from: at(9), to: at(11), title: "Thesis: chapter 3", color: "indigo", suggested: at(8, 42), added: at(8, 52) },
  { from: at(11, 15), to: at(12, 30), title: "Group project", color: null },
  { from: at(13), to: at(14), title: "Tempo run", color: "teal", suggested: at(8, 44), added: at(8, 53) },
];
/** The way to the group project. */
const TRIP = { from: at(11), to: at(11, 15) };

const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17];

/** How far down the day a time is, in percent of its height. */
function down(minutes: number): string {
  return `${((minutes - STORY_DAY.from) / (STORY_DAY.to - STORY_DAY.from)) * 100}%`;
}

function span(from: number, to: number) {
  return { top: down(from), height: `calc(${((to - from) / (STORY_DAY.to - STORY_DAY.from)) * 100}% - 2px)` };
}

/** The day on the left of the pinned stage. Decoration: the stops say the same in words. */
function DayRail() {
  return (
    <div aria-hidden className="story-rail hidden flex-col overflow-hidden rounded-panel border border-line-subtle bg-surface shadow-float">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line-subtle px-4">
        <span className="text-[13px] font-semibold tracking-snug text-ink">{STORY_DAY.name}</span>
        <span data-story-clock className="text-[13px] font-semibold text-today tabular">
          {clockText(STORY_DAY.from)}
        </span>
      </div>

      <div className="relative min-h-0 flex-1">
        {HOURS.map((hour) => (
          <div key={hour} className="absolute inset-x-0 border-t border-line-subtle" style={{ top: down(hour * 60) }}>
            <span className="absolute left-2 top-1 text-[10px] text-ink-3 tabular">{hourLabel(hour)}</span>
          </div>
        ))}

        <div
          data-story-block
          data-from={TRIP.from}
          data-to={TRIP.to}
          className="story-trip absolute left-12 right-2 rounded-[5px] border border-line bg-[repeating-linear-gradient(135deg,var(--color-line)_0_2px,transparent_2px_6px)]"
          style={span(TRIP.from, TRIP.to)}
        />

        {BLOCKS.map((block) => {
          const colors = block.color ? goalColor(block.color).block : "border-line bg-raised text-ink";
          const words = (
            <>
              <span className="block truncate text-[11px] font-medium leading-[14px]">{block.title}</span>
              <span className="block truncate text-[10px] leading-[13px] opacity-80 tabular">{`${clock(block.from)} – ${clock(block.to)}`}</span>
            </>
          );
          return (
            <div
              key={block.title}
              data-story-block
              data-from={block.from}
              data-to={block.to}
              data-suggested={block.suggested}
              data-added={block.added}
              className="story-block absolute left-12 right-2"
              style={span(block.from, block.to)}
            >
              <div className="story-ghost absolute inset-0 overflow-hidden rounded-lg border-2 border-dashed border-ink/25 bg-ink/[0.04] px-1.5 py-1 text-ink-2">{words}</div>
              <div className={`story-real absolute inset-0 overflow-hidden rounded-lg border px-1.5 py-1 ${colors}`}>{words}</div>
            </div>
          );
        })}

        {/* What is over fades a little, and the red line is "now". */}
        <div className="story-past absolute inset-x-0 top-0 bg-surface/55" />
        <div className="story-now absolute inset-x-0 z-[3] h-px bg-today">
          <span className="l-now absolute -left-[3px] -top-[3px] size-[7px] rounded-full bg-today" />
        </div>
      </div>
    </div>
  );
}

function StopRow({ stop }: { stop: Stop }) {
  return (
    <div data-story-stop className="story-stop grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
      <div data-story-part className="story-text min-w-0 max-w-[31rem]">
        <Eyebrow number={stop.time} className="l-rise">
          {stop.tag}
        </Eyebrow>
        <h3 className="l-rise mt-4 text-[32px] leading-[1.1] font-semibold tracking-heading text-ink md:text-[40px]" style={timing({ d: 70 })}>
          {stop.title}
        </h3>
        <p className="story-words l-rise mt-4 text-[17px] leading-7 text-ink-2" style={timing({ d: 140 })}>
          {stop.text}
        </p>
        <ul className="l-rise mt-6 flex flex-col gap-2.5 text-[15px] text-ink" style={timing({ d: 210 })}>
          {stop.points.map((point) => (
            <li key={point} className="flex items-start gap-2.5">
              <span aria-hidden className="mt-[3px] inline-flex size-[18px] shrink-0 items-center justify-center rounded-full bg-ink text-white">
                <Check className="size-3" strokeWidth={3} />
              </span>
              {point}
            </li>
          ))}
        </ul>
        {stop.link && (
          <p className="l-rise mt-7" style={timing({ d: 280 })}>
            <Link
              href="/sign-up"
              className="group inline-flex items-center gap-1.5 rounded-sm text-[15px] font-semibold text-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-4 focus-visible:ring-offset-canvas"
            >
              {stop.link}
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </p>
        )}
      </div>

      {/* The picture waits until a good part of it is on screen. */}
      <div data-story-part data-inset="30" className="story-cell min-w-0">
        <Stage className="story-pic">
          <div data-story-fit className="story-fit flex w-full justify-center">
            {PICTURES[stop.id]}
          </div>
        </Stage>
      </div>
    </div>
  );
}

export function DayStory() {
  return (
    <StoryScroll className="story mx-auto w-full max-w-[1160px] px-5 md:px-8">
      <div data-story-stage className="story-stage">
        <DayRail />
        <div className="story-stops flex flex-col gap-24 py-20 md:gap-32 md:py-28">
          {STORY.map((stop) => (
            <StopRow key={stop.id} stop={stop} />
          ))}
        </div>
      </div>
    </StoryScroll>
  );
}
