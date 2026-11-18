// "Your week in short" (spec 49): the week's summary and the first two of each topic's "Going well" and
// "Needs attention" lists. The details show the same lists in full (overviewInsights).
import { AlertTriangle, Check, FileText } from "lucide-react";
import { TOPICS, type AnalyticsReport } from "@/lib/analytics/report-types";
import { More, WidgetCard, type WidgetProps } from "./parts";

/**
 * The Overview's lists: the first two "Going well" and "Needs attention" of each topic. The first of
 * every topic comes before the seconds, so a short card shows several topics, not only focus.
 */
export function overviewInsights(report: AnalyticsReport): { good: string[]; bad: string[] } {
  const firstTwo = (pick: (t: (typeof TOPICS)[number]) => string[]) => [0, 1].flatMap((n) => TOPICS.flatMap((t) => pick(t).slice(n, n + 1)));
  return { good: firstTwo((t) => report.insights[t].good), bad: firstTwo((t) => report.insights[t].bad) };
}

export function InsightList({ items, kind, max }: { items: string[]; kind: "good" | "bad"; max: number }) {
  const Icon = kind === "good" ? Check : AlertTriangle;
  return (
    <>
      <ul className="mt-2 flex flex-col gap-1.5 text-[13px]">
        {items.slice(0, max).map((text, i) => (
          <li key={i} className="flex gap-2">
            <Icon aria-hidden className={`mt-[3px] size-3.5 shrink-0 ${kind === "good" ? "text-success" : "text-warning"}`} strokeWidth={2.4} />
            <span className="min-w-0">{text}</span>
          </li>
        ))}
      </ul>
      <More count={items.length - max} className="mt-1" />
    </>
  );
}

export function WeekInShortWidget({ report, size, onOpen }: WidgetProps) {
  const { good, bad } = overviewInsights(report);
  const max = size === "L" ? 3 : 2;
  const eyebrow = "text-[11px] font-medium tracking-[0.08em] uppercase";
  return (
    <WidgetCard title="Your week in short" icon={FileText} tint="grey" onOpen={onOpen}>
      <p className="mt-3.5 line-clamp-3 text-[15px] leading-normal">{report.summary || "Nothing to report for this week yet."}</p>
      {(good.length > 0 || bad.length > 0) && (
        <div className="mt-auto grid min-h-0 grid-cols-2 gap-4 overflow-hidden pt-3.5">
          <div className="min-w-0">
            <h4 className={`${eyebrow} text-success`}>Going well</h4>
            {good.length > 0 ? <InsightList items={good} kind="good" max={max} /> : <p className="mt-2 text-[13px] text-ink-2">Nothing yet</p>}
          </div>
          <div className="min-w-0">
            <h4 className={`${eyebrow} text-warning`}>Needs attention</h4>
            {bad.length > 0 ? <InsightList items={bad} kind="bad" max={max} /> : <p className="mt-2 text-[13px] text-ink-2">Nothing right now</p>}
          </div>
        </div>
      )}
    </WidgetCard>
  );
}
