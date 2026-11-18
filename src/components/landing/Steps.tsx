// "How it works" (spec 45): the idea in one sentence, then three steps. Each step has its words on
// the left and a moving picture of the real screen on the right; on phones the picture follows the words.
import type { ReactNode } from "react";
import { ArrowRight, Check, Lock, Mail, MessageSquare, Play, ShoppingBag, TrendingUp, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { STEPS, type Step } from "./content";
import { CoachMock } from "./mocks/CoachMock";
import { FocusMock } from "./mocks/FocusMock";
import { GoalsMock } from "./mocks/GoalsMock";
import { Stage, timing } from "./mocks/parts";
import { Scene } from "./Scene";

const PICTURES: Record<Step["id"], ReactNode> = {
  plan: <CoachMock />,
  focus: <FocusMock />,
  reach: <GoalsMock />,
};

/** What shouts for attention on a normal day. Each gets struck through; one protected block remains. */
const NOISE: { icon: LucideIcon; text: string }[] = [
  { icon: MessageSquare, text: "3 new messages" },
  { icon: Play, text: "Up next in 5 seconds" },
  { icon: TrendingUp, text: "Trending now" },
  { icon: Mail, text: "12 unread" },
  { icon: ShoppingBag, text: "Sale ends today" },
];
const STRIKE_AT = 950;
const STRIKE_GAP = 150;

const LINKS: Record<Step["id"], string> = {
  plan: "Plan your first week",
  focus: "Start a focus session",
  reach: "Set your first goal",
};

/** The small line above a title: a number, a short rule and a word. */
export function Eyebrow({ number, children, className = "" }: { number?: string; children: ReactNode; className?: string }) {
  return (
    <p className={`flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3 ${className}`}>
      {number && (
        <>
          <span className="tabular">{number}</span>
          <span aria-hidden className="h-px w-6 bg-line" />
        </>
      )}
      <span className="text-ink">{children}</span>
    </p>
  );
}

function StepRow({ step }: { step: Step }) {
  return (
    <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
      <Scene className="min-w-0 max-w-[31rem]">
        <Eyebrow number={step.number} className="l-rise">
          {step.tag}
        </Eyebrow>
        <h3 className="l-rise mt-4 text-[32px] leading-[1.1] font-semibold tracking-heading text-ink md:text-[40px]" style={timing({ d: 70 })}>
          {step.title}
        </h3>
        <p className="l-rise mt-4 text-[17px] leading-7 text-ink-2" style={timing({ d: 140 })}>
          {step.text}
        </p>
        <ul className="l-rise mt-6 flex flex-col gap-2.5 text-[15px] text-ink" style={timing({ d: 210 })}>
          {step.points.map((point) => (
            <li key={point} className="flex items-start gap-2.5">
              <span aria-hidden className="mt-[3px] inline-flex size-[18px] shrink-0 items-center justify-center rounded-full bg-ink text-white">
                <Check className="size-3" strokeWidth={3} />
              </span>
              {point}
            </li>
          ))}
        </ul>
        <p className="l-rise mt-7" style={timing({ d: 280 })}>
          <Link
            href="/sign-up"
            className="group inline-flex items-center gap-1.5 rounded-sm text-[15px] font-semibold text-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-4 focus-visible:ring-offset-canvas"
          >
            {LINKS[step.id]}
            <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </p>
      </Scene>

      {/* The picture waits until a good part of it is on screen. */}
      <Scene className="min-w-0" inset={30}>
        <Stage>{PICTURES[step.id]}</Stage>
      </Scene>
    </div>
  );
}

export function Steps() {
  return (
    <section id="how" aria-labelledby="how-title">
      <div className="border-y border-line-subtle bg-surface">
        <Scene className="mx-auto w-full max-w-[1160px] px-5 py-16 md:px-8 md:py-24">
          <Eyebrow className="l-rise">How it works</Eyebrow>
          <h2 id="how-title" className="l-rise mt-5 max-w-[60rem] text-[28px] leading-[1.2] font-semibold tracking-heading text-ink-3 md:text-[40px] md:leading-[1.15]" style={timing({ d: 80 })}>
            Notifications, open tabs, one quick check: most days go to whatever shouts loudest.{" "}
            <span className="text-ink">LockedIn gives your time a plan, and then guards it.</span>
          </h2>
          <ul aria-hidden className="mt-10 flex flex-wrap items-center gap-2">
            {NOISE.map((noise, index) => (
              <li key={noise.text} className="l-rise" style={timing({ d: 260 + index * 70 })}>
                <span className="relative inline-flex h-9 items-center gap-2 rounded-full border border-line-subtle bg-canvas px-3.5 text-[13px] text-ink-3">
                  <noise.icon className="size-3.5" strokeWidth={2} />
                  {noise.text}
                  <span className="l-grow absolute inset-x-3 top-1/2 h-px bg-ink-3" style={timing({ d: STRIKE_AT + index * STRIKE_GAP })} />
                </span>
              </li>
            ))}
            <li className="l-pop" style={timing({ d: STRIKE_AT + NOISE.length * STRIKE_GAP + 150 })}>
              <span className="inline-flex h-9 items-center gap-2 rounded-full bg-ink px-3.5 text-[13px] font-medium text-white">
                <Lock className="size-3.5" strokeWidth={2.2} />
                9:00 – 11:00 · Thesis
              </span>
            </li>
          </ul>
        </Scene>
      </div>

      <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-24 px-5 py-20 md:gap-32 md:px-8 md:py-28">
        {STEPS.map((step) => (
          <StepRow key={step.id} step={step} />
        ))}
      </div>
    </section>
  );
}
