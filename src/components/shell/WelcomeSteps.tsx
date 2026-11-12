"use client";

// The three steps of the welcome dialog, taken over from the first prototype (texts and layout).
// Changed on purpose: no season (goals have a deadline and weekly rules), no coach, no choice of the
// week's first day (weeks start on Monday), no keyboard-shortcut tip (the app has no shortcuts yet).
// The frame, focus and progress dots are in Welcome.tsx.
import { useEffect, useRef, type RefObject } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Link2, Plus, Sparkles, Target, Timer, type LucideIcon } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/Button";
import { APP_NAME } from "@/lib/app-name";
import { goalColor } from "@/lib/goals/colors";
import type { GoalColorName } from "@/lib/goals/style";
import type { TimeFormat } from "@/lib/time/display";

export type StartMode = "demo" | "fresh";

/** The small grey heading above a step's title. */
function Eyebrow({ children }: { children: string }) {
  return <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">{children}</div>;
}

/** A step's heading. It takes the focus when the user moves on to it. */
function StepTitle({ id, focusOnMount, children }: { id: string; focusOnMount: boolean; children: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusOnMount) ref.current?.focus({ preventScroll: true });
  }, [focusOnMount]);
  return (
    <h2 id={id} ref={ref} tabIndex={-1} className="text-[26px] leading-tight font-semibold tracking-heading text-ink outline-none">
      {children}
    </h2>
  );
}

// ---------- Step 1: welcome ----------

function FlowCard({ icon: Icon, label, sub, tone }: { icon: LucideIcon; label: string; sub: string; tone: GoalColorName }) {
  return (
    <div className="flex flex-1 items-center gap-3 rounded-card border border-line-subtle bg-raised p-3">
      <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${goalColor(tone).tile}`}>
        <Icon className="size-4" strokeWidth={1.8} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span className="block text-xs text-ink-3">{sub}</span>
      </span>
    </div>
  );
}

export function StepWelcome({
  focusOnMount,
  primaryRef,
  onNext,
  onSkip,
}: {
  focusOnMount: boolean;
  primaryRef: RefObject<HTMLButtonElement | null>;
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <div>
      <Eyebrow>{`Welcome to ${APP_NAME}`}</Eyebrow>
      <div className="mt-2">
        <StepTitle id="welcome-title-1" focusOnMount={focusOnMount}>
          Turn big goals into focused hours.
        </StepTitle>
      </div>
      <p className="mt-2 text-sm text-ink-2">
        Pick what matters, give it real time on your calendar, and follow through — one focused block at a time.
      </p>
      <div aria-hidden="true" className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
        <FlowCard icon={Target} label="Goals" sub="What matters" tone="rose" />
        <ArrowRight className="hidden size-4 shrink-0 text-ink-3 sm:block" strokeWidth={1.8} />
        <FlowCard icon={CalendarDays} label="Plan" sub="Time blocks" tone="indigo" />
        <ArrowRight className="hidden size-4 shrink-0 text-ink-3 sm:block" strokeWidth={1.8} />
        <FlowCard icon={Timer} label="Focus" sub="Deep work" tone="teal" />
      </div>
      <div className="mt-8 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onSkip}>
          Skip intro
        </Button>
        <button ref={primaryRef} type="button" onClick={onNext} className={buttonClass("primary", "md")}>
          Next
        </button>
      </div>
    </div>
  );
}

// ---------- Step 2: how it works ----------

const LOOP = [
  {
    title: "Choose a few goals",
    text: "Pick two to four goals, give each a deadline, and decide how many hours or events it deserves per week.",
  },
  {
    title: "Plan focused time",
    text: "Turn those hours into time blocks on your calendar. Keep what fits, move the rest.",
  },
  {
    title: "Focus, then check off",
    text: "Start a focus session from any block while distracting sites are blocked. Mark it done and watch your week fill up.",
  },
];

export function StepHow({ focusOnMount, onBack, onNext }: { focusOnMount: boolean; onBack: () => void; onNext: () => void }) {
  return (
    <div>
      <Eyebrow>How it works</Eyebrow>
      <div className="mt-2">
        <StepTitle id="welcome-title-2" focusOnMount={focusOnMount}>
          One simple loop, every week
        </StepTitle>
      </div>
      <ol className="mt-6 flex flex-col gap-5">
        {LOOP.map((row, i) => (
          <li key={row.title} className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-raised text-xs font-semibold tabular text-ink">
              {i + 1}
            </span>
            <span className="min-w-0 pt-0.5">
              <span className="block text-sm font-semibold text-ink">{row.title}</span>
              <span className="mt-0.5 block text-sm text-ink-2">{row.text}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-8 flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext}>Next</Button>
      </div>
    </div>
  );
}

// ---------- Step 3: how do you want to start? ----------

const START_OPTIONS: { value: StartMode; title: string; text: string; icon: LucideIcon }[] = [
  {
    value: "demo",
    title: "Explore the demo",
    text: "Three sample goals, a few tasks and a planned week. You can remove them in Settings.",
    icon: Sparkles,
  },
  {
    value: "fresh",
    title: "Start fresh",
    text: "An empty calendar for your own goals. Your settings stay.",
    icon: Plus,
  },
];

const TIME_OPTIONS: { value: TimeFormat; label: string }[] = [
  { value: "12h", label: "1:30 pm" },
  { value: "24h", label: "13:30" },
];

/** The prototype's pill switch, as a real radio group. */
function Segmented<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-xs text-ink-2">{legend}</legend>
      <div className="inline-flex rounded-full bg-raised p-0.5">
        {options.map((o) => (
          <label key={o.value} className="cursor-pointer">
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="peer sr-only" />
            <span className="flex h-8 items-center rounded-full px-3.5 text-xs font-medium tabular text-ink-2 transition-colors hover:text-ink peer-checked:bg-surface peer-checked:text-ink peer-checked:ring-1 peer-checked:ring-line peer-focus-visible:ring-2 peer-focus-visible:ring-ink/20">
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function StepStart({
  focusOnMount,
  mode,
  onMode,
  timeFormat,
  onTimeFormat,
  busy,
  onBack,
  onFinish,
}: {
  focusOnMount: boolean;
  mode: StartMode;
  onMode: (m: StartMode) => void;
  timeFormat: TimeFormat;
  onTimeFormat: (format: TimeFormat) => void;
  busy: boolean;
  onBack: () => void;
  onFinish: () => void;
}) {
  return (
    <div>
      <StepTitle id="welcome-title-3" focusOnMount={focusOnMount}>
        How do you want to start?
      </StepTitle>

      <fieldset className="mt-6 grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">Start with</legend>
        {START_OPTIONS.map((o) => (
          <label key={o.value} className="flex cursor-pointer">
            <input
              type="radio"
              name="start-mode"
              value={o.value}
              checked={mode === o.value}
              onChange={() => onMode(o.value)}
              className="peer sr-only"
            />
            <span className="flex w-full gap-3 rounded-card border border-line-subtle bg-surface p-4 transition-colors hover:bg-raised/60 peer-checked:border-ink peer-focus-visible:ring-2 peer-focus-visible:ring-ink/20">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-raised text-ink">
                <o.icon className="size-4" strokeWidth={1.8} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{o.title}</span>
                <span className="mt-0.5 block text-sm text-ink-2">{o.text}</span>
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="mt-6">
        <Eyebrow>Quick setup</Eyebrow>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-4">
          <Segmented<TimeFormat> legend="Time format" name="time-format" value={timeFormat} options={TIME_OPTIONS} onChange={onTimeFormat} />
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <Link
          href="/settings#outlook"
          onClick={(e) => {
            // With a modifier key or another mouse button the browser opens a new tab: the dialog stays open.
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            onFinish();
          }}
          className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-ink-2 underline-offset-4 transition-colors hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
        >
          <Link2 className="size-4" strokeWidth={1.8} aria-hidden="true" />
          Connect Outlook
        </Link>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={onBack}>
            Back
          </Button>
          <Button onClick={onFinish} disabled={busy}>
            {busy ? "Getting ready…" : "Get started"}
          </Button>
        </div>
      </div>
    </div>
  );
}
