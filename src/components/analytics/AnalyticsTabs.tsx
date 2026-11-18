"use client";

// The Analytics page (spec 49): the week's header with the week arrows, six tabs, and per tab its
// widgets in a grid. On screens from 1024 px the page is exactly as high as the window: 4 columns and
// 2 rows fill the height below the header, so a tab never scrolls; narrower screens stack the widgets
// in 2 columns, then 1, and scroll. Changing the tab asks the server nothing: the tab is kept in the
// address with history.replaceState (?tab=focus), so a reload and the week arrows stay on it.
// "Edit widgets" and "Export" call onEdit and onExport; their dialogs come in a later step and can sit
// next to the details dialog below.
import { useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Clock, Download, Flame, LayoutGrid, Shield, SlidersHorizontal, Target, Timer, type LucideIcon } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/Button";
import { TAB_LABELS, TABS, type AnalyticsLayout, type AnalyticsReport, type Size, type Tab, type WidgetKind } from "@/lib/analytics/report-types";
import { fmtWeekRange } from "@/lib/time/display";
import { isoWeekNumber } from "@/lib/time/zoned";
import { WidgetDetails } from "./WidgetDetails";
import { WIDGET_COMPONENTS } from "./widgets";

const TAB_ICONS: Record<Tab, LucideIcon> = { overview: LayoutGrid, focus: Timer, goals: Target, time: Clock, streaks: Flame, blocked: Shield };

/** How many columns a widget spans: S one, M two, L three (two below 1024 px, one on phones). */
const SPAN: Record<Size, string> = { S: "", M: "sm:col-span-2", L: "sm:col-span-2 lg:col-span-3" };

/** The page's address for a week and tab. */
export function analyticsHref(week: string, tab: Tab): string {
  return `/analytics?week=${week}&tab=${tab}`;
}

type Props = {
  report: AnalyticsReport;
  layout: AnalyticsLayout;
  /** The tab the page opens on (read from the address on the server). */
  tab: Tab;
  /** Opens "Edit widgets"; without it the button is shown disabled. */
  onEdit?: () => void;
  /** Opens "Export"; without it the button is shown disabled. */
  onExport?: () => void;
};

export function AnalyticsTabs({ report, layout, tab: firstTab, onEdit, onExport }: Props) {
  const [tab, setTab] = useState<Tab>(firstTab);
  const [details, setDetails] = useState<WidgetKind | null>(null);
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  function choose(next: Tab) {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(window.history.state, "", url);
  }

  function onTabKey(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.indexOf(tab);
    const target =
      event.key === "ArrowRight"
        ? TABS[(index + 1) % TABS.length]
        : event.key === "ArrowLeft"
          ? TABS[(index - 1 + TABS.length) % TABS.length]
          : event.key === "Home"
            ? TABS[0]
            : event.key === "End"
              ? TABS[TABS.length - 1]
              : null;
    if (!target) return;
    event.preventDefault();
    choose(target);
    tabRefs.current[target]?.focus();
  }

  const items = layout[tab];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col px-5 py-6 md:px-8 md:py-7 lg:h-dvh lg:overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
          <h1 className="text-[28px] leading-[34px] font-semibold tracking-display text-ink md:text-[30px] md:leading-[38px]">Analytics</h1>
          <p className="text-sm text-ink-2">
            Week {isoWeekNumber(report.monday)} · {fmtWeekRange(report.monday)}
          </p>
        </div>
        <nav aria-label="Weeks" className="flex items-center gap-1.5">
          <LinkButton href={analyticsHref(report.previous, tab)} variant="secondary" size="icon" aria-label="Previous week" title="Previous week">
            <ChevronLeft className="size-4" />
          </LinkButton>
          <LinkButton href={analyticsHref(report.next, tab)} variant="secondary" size="icon" aria-label="Next week" title="Next week">
            <ChevronRight className="size-4" />
          </LinkButton>
          <LinkButton href={analyticsHref(report.thisWeek, tab)} variant="secondary" aria-current={report.monday === report.thisWeek ? "page" : undefined}>
            This week
          </LinkButton>
        </nav>
      </header>

      <div className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Statistics" onKeyDown={onTabKey} className="flex flex-wrap gap-1.5">
          {TABS.map((t) => {
            const Icon = TAB_ICONS[t];
            const on = t === tab;
            return (
              <button
                key={t}
                ref={(el) => {
                  tabRefs.current[t] = el;
                }}
                type="button"
                role="tab"
                id={`analytics-tab-${t}`}
                aria-selected={on}
                aria-controls="analytics-panel"
                tabIndex={on ? 0 : -1}
                onClick={() => choose(t)}
                className={`inline-flex h-9 items-center gap-[7px] rounded-full border px-3.5 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
                  on ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2 hover:bg-raised hover:text-ink"
                }`}
              >
                <Icon aria-hidden className="size-[15px]" strokeWidth={2} />
                {TAB_LABELS[t]}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5">
          <span title={onEdit ? undefined : "Coming next"}>
            <Button variant="secondary" onClick={onEdit} disabled={!onEdit} title={onEdit ? undefined : "Coming next"}>
              <SlidersHorizontal aria-hidden className="size-4" />
              Edit widgets
            </Button>
          </span>
          <span title={onExport ? undefined : "Coming next"}>
            <Button onClick={onExport} disabled={!onExport} title={onExport ? undefined : "Coming next"}>
              <Download aria-hidden className="size-4" />
              Export
            </Button>
          </span>
        </div>
      </div>

      <div
        role="tabpanel"
        id="analytics-panel"
        aria-labelledby={`analytics-tab-${tab}`}
        className="mt-5 grid auto-rows-[18rem] grid-cols-1 gap-4 sm:grid-cols-2 lg:min-h-0 lg:flex-1 lg:grid-cols-4 lg:grid-rows-2"
      >
        {items.length === 0 && <p className="text-sm text-ink-2">No widgets on this tab. Add some with &ldquo;Edit widgets&rdquo;.</p>}
        {items.map((item, index) => {
          const Widget = WIDGET_COMPONENTS[item.kind];
          return (
            <div key={`${tab}-${item.kind}`} className={`min-h-0 min-w-0 ${SPAN[item.size]}`}>
              <Widget report={report} size={item.size} hero={tab === "overview" && index === 0 && item.kind === "focus_time"} onOpen={() => setDetails(item.kind)} />
            </div>
          );
        })}
      </div>

      <WidgetDetails report={report} kind={details} onClose={() => setDetails(null)} />
    </div>
  );
}
