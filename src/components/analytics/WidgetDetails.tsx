"use client";

// A widget's details (spec 49, "Details"): a dialog in the middle with the widget drawn large, what goes
// well and what does not in its topic, and the topic's summary. A native <dialog> like the app's other
// dialogs (src/components/widgets/Dialog.tsx): the cross, "Done", Escape or a click beside it close it,
// and the focus goes back to the widget that opened it.
import { useEffect, useRef } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { WIDGETS, type AnalyticsReport, type Insights, type WidgetKind } from "@/lib/analytics/report-types";
import { fmtWeekRange } from "@/lib/time/display";
import { isoWeekNumber } from "@/lib/time/zoned";
import { WIDGET_COMPONENTS } from "./widgets";
import { overviewInsights } from "./widgets/overview";

/** The lists and summary a widget's details show: its topic's, or the Overview's for "Your week in short". */
export function detailsInsights(report: AnalyticsReport, kind: WidgetKind): Insights {
  const topic = WIDGETS[kind].topic;
  if (topic === "overview") return { ...overviewInsights(report), summary: report.summary };
  return report.insights[topic];
}

function InsightCard({ title, items, kind }: { title: string; items: string[]; kind: "good" | "bad" }) {
  return (
    <section className="rounded-card border border-line-subtle px-[18px] py-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <span aria-hidden className={`flex size-[22px] items-center justify-center rounded-full ${kind === "good" ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>
          {kind === "good" ? <Check className="size-3" strokeWidth={3} /> : <span className="text-[13px] leading-none font-bold">!</span>}
        </span>
        {title}
      </h3>
      {items.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2.5 text-sm">
          {items.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-ink-2">Nothing to say here this week.</p>
      )}
    </section>
  );
}

export function WidgetDetails({ report, kind, onClose }: { report: AnalyticsReport; kind: WidgetKind | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const open = kind !== null;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      element.showModal();
    }
    if (!open) {
      if (element.open) element.close();
      returnTo.current?.focus();
      returnTo.current = null;
    }
  }, [open]);

  const titleId = "widget-details-title";
  const widget = kind ? WIDGETS[kind] : null;
  const Widget = kind ? WIDGET_COMPONENTS[kind] : null;
  const insights = kind ? detailsInsights(report, kind) : null;
  const hasLists = insights !== null && (insights.good.length > 0 || insights.bad.length > 0);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => event.target === dialog.current && onClose()}
      className="event-editor m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-card bg-surface p-0 text-ink shadow-pop md:m-auto md:max-h-[calc(100dvh-3rem)] md:max-w-[880px] md:rounded-panel"
    >
      {kind && widget && Widget && insights && (
        <div className="flex max-h-[inherit] flex-col">
          <div className="flex shrink-0 items-center gap-3 px-5 pt-5 pb-3 md:px-7 md:pt-7">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="truncate text-xl leading-6 font-semibold tracking-heading">
                {widget.title}
              </h2>
              <p className="mt-0.5 text-[13px] text-ink-2">
                Week {isoWeekNumber(report.monday)} · {fmtWeekRange(report.monday)}
              </p>
            </div>
            <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
              <X className="size-[18px]" aria-hidden />
            </Button>
          </div>

          <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-2 md:px-7">
            {kind !== "week_in_short" && (
              <div className="h-80 shrink-0">
                <Widget report={report} size="L" />
              </div>
            )}
            {hasLists && (
              <div className="grid gap-4 md:grid-cols-2">
                <InsightCard title="What's going well" items={insights.good} kind="good" />
                <InsightCard title="What's not going well" items={insights.bad} kind="bad" />
              </div>
            )}
            {insights.summary && (
              <div className="rounded-card bg-raised px-[18px] py-4">
                <div className="text-[11px] font-medium tracking-[0.08em] text-ink-3 uppercase">Summary</div>
                <p className="mt-1.5 text-[15px] leading-normal">{insights.summary}</p>
              </div>
            )}
          </div>

          <div className="flex shrink-0 justify-end px-5 py-4 md:px-7 md:pb-6">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </dialog>
  );
}
