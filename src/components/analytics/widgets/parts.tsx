// The pieces every Analytics widget (spec 49) is built from: the card with its name, icon tile and
// details button, the pill that shows a change against last week, a bar chart drawn with plain markup,
// and the small text helpers. A widget draws only what the report holds; nothing here reads the clock.
import { useId, type ReactNode } from "react";
import { ArrowUpRight, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import type { AnalyticsReport, GoalsNumbers, RuleNumbers, Size } from "@/lib/analytics/report-types";
import { fmtDateLong, fmtMinutes } from "@/lib/time/display";
import { isoWeekNumber, type LocalDate } from "@/lib/time/zoned";

/** What every widget gets. `hero`: the black Focus time card at the top of the Overview. */
export type WidgetProps = {
  report: AnalyticsReport;
  size: Size;
  /** Opens the widget's details; left out where the widget is shown inside its own details. */
  onOpen?: () => void;
  hero?: boolean;
};

/** The soft icon tiles of the mockup. */
export const TINTS = {
  indigo: "bg-indigo-50 text-indigo-700",
  green: "bg-emerald-50 text-emerald-700",
  orange: "bg-orange-50 text-orange-700",
  violet: "bg-violet-50 text-violet-700",
  sky: "bg-sky-50 text-sky-700",
  amber: "bg-amber-50 text-amber-800",
  teal: "bg-teal-50 text-teal-700",
  rose: "bg-rose-50 text-rose-700",
  grey: "bg-raised text-ink",
  /** The orange streak card's own tile. */
  flame: "bg-orange-500 text-white",
} as const;

type Tone = "plain" | "dark" | "orange";

const TONES: Record<Tone, { card: string; label: string; arrow: string }> = {
  plain: { card: "border-line-subtle bg-surface text-ink", label: "text-ink-2", arrow: "text-ink-3" },
  dark: { card: "border-ink bg-ink text-white", label: "text-white/70", arrow: "text-white/70" },
  orange: { card: "border-orange-200 bg-orange-50 text-orange-900", label: "text-orange-900", arrow: "text-orange-800" },
};

/**
 * A widget's card: white, a fine border, 16 px corners. The name in the head is a button that opens
 * the details; its click area is stretched over the whole card, so a click anywhere opens them, while
 * the card's text, lists and tables stay readable for screen readers.
 */
export function WidgetCard({
  title,
  icon: Icon,
  tint,
  onOpen,
  tone = "plain",
  bare = false,
  row = false,
  className = "",
  children,
}: {
  title: string;
  icon: LucideIcon;
  tint: keyof typeof TINTS;
  onOpen?: () => void;
  tone?: Tone;
  /** No head: the card draws its own first line with <CardLabel> (the hero card). */
  bare?: boolean;
  /** Content side by side instead of stacked. */
  row?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  const look = TONES[tone];
  return (
    <section
      aria-label={bare ? title : undefined}
      aria-labelledby={bare ? undefined : id}
      className={`relative flex h-full min-h-0 min-w-0 ${row ? "flex-row" : "flex-col"} overflow-hidden rounded-card border p-5 ${look.card} ${
        onOpen ? "transition-[border-color,box-shadow] duration-150 hover:border-line hover:shadow-float" : ""
      } ${className}`}
    >
      {!bare && (
        <div className="flex shrink-0 items-center gap-2.5">
          <span aria-hidden className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${TINTS[tint]}`}>
            <Icon className="size-4" strokeWidth={2} />
          </span>
          <h3 id={id} className={`min-w-0 flex-1 truncate text-[13px] font-medium ${look.label}`}>
            {onOpen ? <OpenButton onOpen={onOpen}>{title}</OpenButton> : title}
          </h3>
          {onOpen && <ArrowUpRight aria-hidden className={`size-4 shrink-0 ${look.arrow}`} />}
        </div>
      )}
      {children}
    </section>
  );
}

/** The button that opens a widget's details; its click area covers the whole card. */
function OpenButton({ onOpen, children }: { onOpen: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left after:absolute after:inset-0 after:rounded-card after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ink/30 focus-visible:after:ring-offset-2"
    >
      {children}
      <span className="sr-only">, open details</span>
    </button>
  );
}

/** The first line of a bare card (the hero card): a label shown, the widget's name for screen readers, and the details button. */
export function CardLabel({ title, label, onOpen, className = "" }: { title: string; label: string; onOpen?: () => void; className?: string }) {
  const text = (
    <>
      <span aria-hidden>{label}</span>
      <span className="sr-only">{title}</span>
    </>
  );
  return <h3 className={`text-[13px] font-medium ${className}`}>{onOpen ? <OpenButton onOpen={onOpen}>{text}</OpenButton> : text}</h3>;
}

/** The big number of a card. */
export function Big({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`tabular text-[40px] leading-none font-semibold tracking-display ${className}`}>{children}</span>;
}

/** A short grey sentence where a chart or list would be empty. */
export function Empty({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-[13px] text-ink-2 ${className}`}>{children}</p>;
}

/**
 * A change against last week as a round pill: green when it is good for the user, grey otherwise, with
 * the arrow for up or down. Nothing when there is nothing to compare with.
 */
export function ChangePill({ text, direction, good, className = "" }: { text: string; direction: "up" | "down" | "same"; good: boolean; className?: string }) {
  const Arrow = direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : null;
  return (
    <span
      className={`inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full px-2 text-xs font-semibold whitespace-nowrap ${
        good ? "bg-success-soft text-success" : "bg-raised text-ink-2"
      } ${className}`}
    >
      {Arrow && <Arrow aria-hidden className="size-3" strokeWidth={2.4} />}
      {text}
    </span>
  );
}

/**
 * What the shown week is compared with (issue #126). A running week only against last week up to the
 * same moment, so Wednesday is not measured against a whole week.
 */
export const lastWeekName = (running: boolean) => (running ? "this time last week" : "last week");

/** The pill and "vs last week" (or "vs this time last week" while the week runs) next to it. */
export function VsLastWeek({ change, running = false }: { change: Change | null; running?: boolean }) {
  if (!change) return null;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <ChangePill {...change} />
      <span className="text-xs text-ink-3">vs {lastWeekName(running)}</span>
    </span>
  );
}

export type Change = { text: string; direction: "up" | "down" | "same"; good: boolean };

/** A count against last week: "2 more", "8 fewer", "Same". `moreIsGood` says which way is good. */
export function countChange(now: number, before: number, moreIsGood: boolean): Change {
  const diff = now - before;
  if (diff === 0) return { text: "Same", direction: "same", good: false };
  const up = diff > 0;
  return { text: `${Math.abs(diff)} ${up ? "more" : "fewer"}`, direction: up ? "up" : "down", good: up === moreIsGood };
}

/** A percent change: "19 %". */
export function percentChange(now: number, before: number): Change | null {
  if (before <= 0) return null;
  const percent = Math.round(((now - before) / before) * 100);
  if (percent === 0) return { text: "Same", direction: "same", good: false };
  return { text: `${Math.abs(percent)} %`, direction: percent > 0 ? "up" : "down", good: percent > 0 };
}

/** A change in points (score, percent of plan): "6 points". */
export function pointsChange(now: number | null, before: number | null): Change | null {
  if (now === null || before === null) return null;
  const diff = now - before;
  if (diff === 0) return { text: "Same", direction: "same", good: false };
  return { text: `${Math.abs(diff)} ${Math.abs(diff) === 1 ? "point" : "points"}`, direction: diff > 0 ? "up" : "down", good: diff > 0 };
}

/** "49 min" under an hour, else "11h 30m" (the mockup's way of writing time). */
export function duration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return m < 60 ? `${m} min` : fmtMinutes(m);
}

/** "W46" */
export function weekLabel(monday: LocalDate): string {
  return `W${isoWeekNumber(monday)}`;
}

/** "Wednesday" */
export function weekdayLong(date: LocalDate): string {
  return fmtDateLong(date).split(",")[0];
}

export const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const WEEKDAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** "1 day", "3 days" */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** A number with at most one decimal: 2 → "2", 2.15 → "2.2". */
export function num(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** "4 of 4 sessions" or "2.1 of 2 h". */
export function ruleText(rule: RuleNumbers): string {
  return rule.unit === "hours" ? `${num(rule.done)} of ${num(rule.target)} h` : `${num(rule.done)} of ${num(rule.target)} ${rule.target === 1 ? "session" : "sessions"}`;
}

/** How much a goal is short of its first rule not reached yet ("2 short", "1.5 h short"); null when nothing is short. */
export function shortText(goal: GoalsNumbers["list"][number]): string | null {
  if (goal.status === "met") return null;
  const rule = goal.rules.find((r) => r.done < r.target);
  if (!rule) return null;
  const missing = rule.target - rule.done;
  return rule.unit === "hours" ? `${num(missing)} h short` : `${num(missing)} short`;
}

/** How far a goal got this week, 0 to 1: the average of its rules, each at most 1. */
export function goalShare(goal: GoalsNumbers["list"][number]): number {
  if (goal.rules.length === 0) return 0;
  const sum = goal.rules.reduce((total, r) => total + (r.target > 0 ? Math.min(1, r.done / r.target) : 1), 0);
  return sum / goal.rules.length;
}

/** "+2 more" under a cut list. */
export function More({ count, className = "" }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return <p className={`shrink-0 text-xs text-ink-3 ${className}`}>+{count} more</p>;
}

export type Bar = { key: string; label: string; value: number; text: string; strong: boolean };

/**
 * Upright bars, drawn with plain markup and hidden from screen readers (the widget gives the same
 * numbers as text). They grow with the card: each bar is a share of the tallest one. `line` draws a
 * dashed line at that value (the 8-week average).
 */
export function Bars({
  bars,
  strong = "bg-ink",
  soft = "bg-ink/15",
  line,
  gap = "gap-2.5",
  maxBar = "max-w-14",
  className = "",
}: {
  bars: Bar[];
  strong?: string;
  soft?: string;
  line?: number;
  gap?: string;
  maxBar?: string;
  className?: string;
}) {
  const max = Math.max(1, ...bars.map((b) => b.value), line ?? 0);
  return (
    <div aria-hidden className={`flex min-h-16 flex-1 ${gap} pt-3 ${className}`}>
      {bars.map((bar) => (
        <div key={bar.key} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <span className={`max-w-full truncate text-[11px] tabular ${bar.strong ? "font-semibold text-ink" : "text-ink-3"}`}>{bar.text}</span>
          <div className="relative flex min-h-0 w-full flex-1 items-end justify-center">
            {line !== undefined && line > 0 && <span className="absolute inset-x-[-6px] border-t-2 border-dashed border-ink-3/50" style={{ bottom: `${(line / max) * 100}%` }} />}
            <span
              className={`w-full ${maxBar} rounded-t-md rounded-b-[2px] ${bar.value > 0 ? (bar.strong ? strong : soft) : "bg-muted"}`}
              style={{ height: bar.value > 0 ? `${Math.max(3, (bar.value / max) * 100)}%` : "2px" }}
            />
          </div>
          <span className={`max-w-full truncate text-[11px] whitespace-nowrap ${bar.strong ? "font-semibold text-ink" : "text-ink-3"}`}>{bar.label}</span>
        </div>
      ))}
    </div>
  );
}

/** A list only screen readers read: the numbers behind a chart. */
export function SrList({ label, items }: { label: string; items: string[] }) {
  return (
    <ul className="sr-only" aria-label={label}>
      {items.map((text, i) => (
        <li key={i}>{text}</li>
      ))}
    </ul>
  );
}

/** The index of the largest value (the earliest of equal ones); -1 when all are 0. */
export function topIndex(values: number[]): number {
  let best = -1;
  values.forEach((v, i) => {
    if (v > 0 && (best === -1 || v > values[best])) best = i;
  });
  return best;
}

/** A thin progress bar, hidden from screen readers. */
export function Progress({ share, track = "bg-muted", fill, className = "" }: { share: number; track?: string; fill: string; className?: string }) {
  const width = Math.max(0, Math.min(1, Number.isFinite(share) ? share : 0)) * 100;
  return (
    <div aria-hidden className={`h-1.5 shrink-0 rounded-full ${track} ${className}`}>
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${width}%` }} />
    </div>
  );
}

export const NO_SESSIONS = "No focus sessions this week yet";
export const NO_GOALS = "No goals with a weekly target yet";
export const NOTHING_DONE = "Nothing marked done in your calendar this week yet";
export const NO_BLOCKED = "No blocked visits this week";
