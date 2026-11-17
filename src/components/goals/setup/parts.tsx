"use client";

// Small parts of the goal setup (spec 42): the question's heading, the answer cards as one radio group
// (arrow keys move, Space or Enter chooses), the stepper, the chips and the counting number.
// The animations are CSS classes in globals.css, declared only for people who allow motion.
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { Minus, Plus } from "lucide-react";

export const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

/** Whether the person asked for less motion (only read in handlers and effects, never while rendering). */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The place of an element in a staggered list, for the `setup-rise` delay. */
export function stagger(index: number): CSSProperties {
  return { "--i": index } as CSSProperties;
}

/** The question as the heading of the dialog's content. The frame moves the focus to it on every change. */
export function QuestionTitle({ id, children, sub }: { id: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <h2 id={id} data-setup-heading tabIndex={-1} className="text-[22px] leading-tight font-semibold tracking-heading text-ink outline-none md:text-[24px]">
        {children}
      </h2>
      {sub && <p className="mt-1.5 text-sm text-ink-2">{sub}</p>}
    </div>
  );
}

/** A check mark that draws itself when it appears. */
export function DrawnCheck({ className = "size-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} className="setup-check-path" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export type Choice<T extends string> = {
  value: T;
  title: string;
  line?: string;
  icon?: ReactNode;
};

/**
 * Answer cards as one radio group: the arrow keys (and Home, End) move the focus, Space or Enter (or a
 * click) chooses. The chosen card gives a small press and its check mark draws itself. Cards rise in
 * one after the other.
 */
export function ChoiceGroup<T extends string>({
  labelledBy,
  choices,
  value,
  onChoose,
  layout = "grid gap-2 sm:grid-cols-2",
  size = "card",
  idPrefix,
}: {
  labelledBy: string;
  choices: Choice<T>[];
  value: T | null;
  onChoose: (value: T) => void;
  layout?: string;
  /** "card": large cards with a line; "chip": small round chips. */
  size?: "card" | "chip";
  idPrefix: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const chosenIndex = choices.findIndex((c) => c.value === value);
  const tabStop = chosenIndex >= 0 ? chosenIndex : 0;

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = choices.length - 1;
    const next =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? index === last
          ? 0
          : index + 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? index === 0
            ? last
            : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className={layout}>
      {choices.map((choice, index) => {
        const on = choice.value === value;
        // The wrapper rises in; the button itself gives the press (two elements, so choosing never replays the rise).
        return (
          <div key={choice.value} className="setup-rise flex" style={stagger(index)}>
            <button
              ref={(element) => {
                refs.current[index] = element;
              }}
              id={`${idPrefix}-${choice.value}`}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={index === tabStop ? 0 : -1}
              onClick={() => onChoose(choice.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={size === "card" ? cardClass(on) : chipClass(on)}
            >
              {size === "card" ? (
                <>
                  {choice.icon && (
                    <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors ${on ? "bg-ink text-white" : "bg-raised text-ink"}`}>
                      {choice.icon}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 pr-6">
                    <span className="block text-sm font-semibold text-ink">{choice.title}</span>
                    {choice.line && <span className="mt-0.5 block text-[13px] leading-snug break-words text-ink-2">{choice.line}</span>}
                  </span>
                  <span
                    aria-hidden
                    className={`absolute top-3 right-3 flex size-5 items-center justify-center rounded-full transition-colors ${on ? "bg-ink text-white" : "border border-line"}`}
                  >
                    {on && <DrawnCheck />}
                  </span>
                </>
              ) : (
                <>
                  {on && <DrawnCheck className="-ml-0.5 size-3.5" />}
                  {choice.title}
                </>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function cardClass(on: boolean): string {
  return `relative flex min-h-[60px] w-full items-center gap-3 rounded-card border p-3.5 text-left transition-colors ${focusRing} ${
    on ? "setup-press border-ink bg-raised/50" : "border-line-subtle bg-surface hover:bg-raised/60"
  }`;
}

export function chipClass(on: boolean): string {
  return `inline-flex min-h-11 items-center justify-center gap-1 rounded-full border px-3.5 text-sm font-medium tabular transition-colors ${focusRing} ${
    on ? "setup-press border-ink bg-ink text-white" : "border-line bg-surface text-ink hover:bg-raised"
  }`;
}

/**
 * A number with minus and plus. The number itself is a spin button: the arrow keys change it, Home and
 * End go to the ends. `format` writes the value ("1 h 15 min").
 */
export function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format = String,
  fewer,
  more,
  numberRef,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  fewer: string;
  more: string;
  numberRef?: RefObject<HTMLDivElement | null>;
}) {
  const set = (next: number) => onChange(Math.max(min, Math.min(max, next)));
  const round = `flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink transition-[background-color,transform,opacity] hover:bg-raised active:scale-95 disabled:pointer-events-none disabled:opacity-35 ${focusRing}`;
  return (
    <div className="flex items-center gap-3">
      <button type="button" aria-label={fewer} disabled={value <= min} onClick={() => set(value - step)} className={round}>
        <Minus className="size-4" strokeWidth={2} aria-hidden />
      </button>
      <div
        ref={numberRef}
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        onKeyDown={(event) => {
          const next =
            event.key === "ArrowUp" || event.key === "ArrowRight"
              ? value + step
              : event.key === "ArrowDown" || event.key === "ArrowLeft"
                ? value - step
                : event.key === "Home"
                  ? min
                  : event.key === "End"
                    ? max
                    : null;
          if (next === null) return;
          event.preventDefault();
          set(next);
        }}
        className={`min-w-16 rounded-lg px-1 text-center text-[28px] leading-none font-semibold tracking-heading text-ink tabular ${focusRing}`}
      >
        <span key={value} className="setup-tag-flip inline-block">
          {format(value)}
        </span>
      </div>
      <button type="button" aria-label={more} disabled={value >= max} onClick={() => set(value + step)} className={round}>
        <Plus className="size-4" strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}

/**
 * A number that counts to its new value over a short moment (only in effects and animation frames, so
 * the first render, on the server too, shows the value itself). Without motion it jumps.
 */
export function useCountUp(target: number, duration = 360): number {
  const [shown, setShown] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const from = current.current;
    if (from === target) return;
    let frame = 0;
    if (prefersReducedMotion()) {
      frame = requestAnimationFrame(() => {
        current.current = target;
        setShown(target);
      });
      return () => cancelAnimationFrame(frame);
    }
    let started: number | null = null;
    const tick = (now: number) => {
      started ??= now;
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      current.current = from + (target - from) * eased;
      setShown(current.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return shown;
}
