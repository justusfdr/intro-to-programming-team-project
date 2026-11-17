// The small pictures inside an article (spec 29): a few bars to compare, steps in a row, and
// numbers on tiles. Every value is written out next to its mark, so nothing depends on colour or
// on reading a bar's length. The bars grow and the steps arrive once (globals.css), unless the
// reader asked for less motion.
import type { Bar, Stat } from "@/lib/library/types";

const card = "rounded-card border border-line-subtle bg-surface p-5";

/** Bars from zero, the longest filling the row. The ones the text is about are black, the rest grey. */
export function BarsFigure({ title, bars, note }: { title: string; bars: Bar[]; note?: string }) {
  const longest = Math.max(...bars.map((bar) => bar.value));
  return (
    <figure className={card}>
      <figcaption className="text-sm font-semibold text-ink">{title}</figcaption>
      <ul className="mt-4 flex flex-col gap-3.5">
        {bars.map((bar) => (
          <li key={bar.label}>
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span className="text-ink-2">{bar.label}</span>
              <span className="shrink-0 font-semibold tabular text-ink">{bar.text}</span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-raised" aria-hidden="true">
              <div
                className={`library-bar h-2 rounded-full ${bar.strong ? "bg-ink" : "bg-ink/30"}`}
                style={{ width: `${Math.max(2, (bar.value / longest) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      {note && <p className="mt-4 text-xs leading-4 text-ink-3">{note}</p>}
    </figure>
  );
}

const COLUMNS: Record<number, string> = { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-4" };

/** What happens, one thing after the other: a numbered row on wide screens, a list on phones. */
export function StepsFigure({ title, steps }: { title: string; steps: { label: string; detail: string }[] }) {
  return (
    <figure className={card}>
      <figcaption className="text-sm font-semibold text-ink">{title}</figcaption>
      <ol className={`mt-4 grid gap-4 md:gap-5 ${COLUMNS[steps.length] ?? "md:grid-cols-4"}`}>
        {steps.map((step, index) => (
          <li key={step.label} className="library-step relative flex gap-3 md:block" style={{ animationDelay: `${index * 140}ms` }}>
            {/* The line to the next step, on wide screens. */}
            {index < steps.length - 1 && <span aria-hidden="true" className="absolute left-9 right-0 top-3.5 hidden h-px bg-line md:block" />}
            <span className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold tabular text-white">
              {index + 1}
            </span>
            <div className="min-w-0 md:mt-3">
              <p className="text-sm font-semibold text-ink">{step.label}</p>
              <p className="mt-0.5 text-sm leading-5 text-ink-2">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </figure>
  );
}

/** Two or three numbers next to each other, each with what it counts. */
export function StatRow({ stats }: { stats: Stat[] }) {
  return (
    <dl className={`grid gap-3 ${stats.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
      {stats.map((stat) => (
        <div key={stat.label} className="flex flex-col-reverse justify-end rounded-card bg-raised p-4">
          <dt className="mt-1 text-xs leading-4 text-ink-2">{stat.label}</dt>
          <dd className="text-[28px] leading-8 font-semibold tracking-display tabular text-ink">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}
