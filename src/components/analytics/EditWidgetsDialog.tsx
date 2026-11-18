"use client";

// "Edit widgets" of the Analytics page (spec 49): per tab, which widgets show and how big they are.
// Changes are tried out here with the same check the server uses (src/lib/analytics/layout.ts), so
// "No room on this tab" shows at once; "Save" sends the whole layout (save_analytics_widgets) and the
// page shows it only after the server has accepted it. "Reset" goes back to the standard layout.
import { useState } from "react";
import {
  Award,
  CalendarCheck,
  CalendarDays,
  ChartColumn,
  Check,
  Clock,
  FileText,
  Flame,
  LayoutGrid,
  List,
  Shield,
  Sun,
  Target,
  Timer,
  TriangleAlert,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { WidgetDialog } from "@/components/widgets/Dialog";
import { fits, LAYOUT_MESSAGES, sizesOf, standardLayout, widgetsFor } from "@/lib/analytics/layout";
import { FIELDS_OF, GRID_COLUMNS, GRID_ROWS, TAB_LABELS, TABS, WIDGETS, type AnalyticsLayout, type Size, type Tab, type WidgetKind } from "@/lib/analytics/report-types";
import { postJson } from "@/lib/client/post-json";
import { SwitchKnob } from "./Switch";

const ICONS: Record<WidgetKind, LucideIcon> = {
  focus_time: Clock,
  focus_score: Zap,
  sessions: Timer,
  weeks: ChartColumn,
  best_hours: Sun,
  best_of_week: Award,
  goals_reached: Target,
  goal_streaks: Flame,
  deadlines: CalendarDays,
  plan: CalendarCheck,
  slipped: TriangleAlert,
  time_by_day: ChartColumn,
  top_areas: List,
  plan_kept: CalendarCheck,
  busiest_day: Sun,
  time_on_goals: Target,
  streak: Flame,
  heatmap: LayoutGrid,
  weekdays: ChartColumn,
  blocked_visits: Shield,
  clean_sessions: Check,
  blocked_weeks: ChartColumn,
  blocked_hours: Clock,
  top_sites: Shield,
  week_in_short: FileText,
};

/** The soft colour of a widget's icon tile, by its topic (the same tints as on the page). */
const TINT: Record<(typeof WIDGETS)[WidgetKind]["topic"], string> = {
  focus: "bg-[#f5f3ff] text-[#6d28d9]",
  goals: "bg-[#eef2ff] text-[#4338ca]",
  time: "bg-[#f0fdfa] text-[#0f766e]",
  streaks: "bg-[#fff7ed] text-[#c2410c]",
  blocked: "bg-[#fff1f2] text-[#be123c]",
  overview: "bg-raised text-ink",
};

const FIELDS = GRID_COLUMNS * GRID_ROWS;
const SIZE_NAMES: Record<Size, string> = { S: "Small", M: "Medium", L: "Large" };
const fieldsOf = (layout: AnalyticsLayout, tab: Tab) => layout[tab].reduce((sum, item) => sum + FIELDS_OF[item.size], 0);

export function EditWidgetsDialog({
  open,
  onClose,
  layout,
  firstTab,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** The layout the page shows now. */
  layout: AnalyticsLayout;
  /** The tab the page is on: the dialog opens there. */
  firstTab: Tab;
  /** Called with the layout the server saved (or the standard one after a reset). */
  onSaved: (layout: AnalyticsLayout) => void;
}) {
  return (
    <WidgetDialog open={open} onClose={onClose} title="Edit widgets" titleId="edit-widgets-title" width="md:max-w-[920px]">
      {/* The body mounts with the dialog, so every opening starts from what the page shows. */}
      {open && <Editor layout={layout} firstTab={firstTab} onSaved={onSaved} onClose={onClose} />}
    </WidgetDialog>
  );
}

function Editor({ layout, firstTab, onSaved, onClose }: { layout: AnalyticsLayout; firstTab: Tab; onSaved: (layout: AnalyticsLayout) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<AnalyticsLayout>(() => structuredClone(layout));
  const [tab, setTab] = useState<Tab>(firstTab);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const items = draft[tab];
  const used = fieldsOf(draft, tab);

  /** Takes a changed list for the open tab only when it still fits on one screen. */
  function tryItems(next: AnalyticsLayout[Tab]) {
    if (!fits(next)) {
      setMessage(LAYOUT_MESSAGES.noRoom);
      return;
    }
    setMessage("");
    setDraft({ ...draft, [tab]: next });
  }

  function toggle(kind: WidgetKind) {
    if (items.some((item) => item.kind === kind)) {
      tryItems(items.filter((item) => item.kind !== kind));
      return;
    }
    // A new widget comes in its standard size, or in the first of its sizes that still fits.
    const size = sizesOf(kind).find((s) => fits([...items, { kind, size: s }]));
    if (!size) {
      setMessage(LAYOUT_MESSAGES.noRoom);
      return;
    }
    tryItems([...items, { kind, size }]);
  }

  function resize(kind: WidgetKind, size: Size) {
    tryItems(items.map((item) => (item.kind === kind ? { kind, size } : item)));
  }

  async function send(body: { layout: AnalyticsLayout } | { reset: true }) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    const answer = await postJson("/api/analytics/widgets", body);
    setBusy(false);
    if (!answer.ok) {
      setMessage(answer.message);
      return;
    }
    const saved = (answer.data as { layout?: AnalyticsLayout } | undefined)?.layout;
    onSaved(saved ?? ("reset" in body ? standardLayout() : body.layout));
    onClose();
  }

  return (
    <div className="flex flex-col">
      <p className="px-5 pb-4 text-[13px] text-ink-2">Choose which widgets each tab shows and how big they are. Every tab fits on one screen: {FIELDS} fields.</p>

      <div className="flex flex-col gap-4 px-5 md:flex-row md:gap-5">
        <div role="tablist" aria-label="Tabs" aria-orientation="vertical" className="flex shrink-0 gap-1 overflow-x-auto md:w-44 md:flex-col md:gap-0.5 md:overflow-visible">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={t === tab}
              onClick={() => {
                setTab(t);
                setMessage("");
              }}
              className={`flex h-9 shrink-0 items-center justify-between gap-3 rounded-lg px-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 ${
                t === tab ? "bg-raised font-medium text-ink" : "text-ink-2 hover:bg-raised/60 hover:text-ink"
              }`}
            >
              {TAB_LABELS[t]}
              <span className="tabular text-xs text-ink-3">
                {fieldsOf(draft, t)}/{FIELDS}
              </span>
            </button>
          ))}
        </div>

        <div role="tabpanel" aria-label={TAB_LABELS[tab]} className="scroll-thin grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 md:max-h-[min(560px,calc(100dvh-19rem))] md:overflow-y-auto md:pr-1 lg:grid-cols-3">
          {widgetsFor(tab).map((kind) => {
            const item = items.find((i) => i.kind === kind);
            const on = item !== undefined;
            const Icon = ICONS[kind];
            return (
              <div key={kind} className={`flex min-h-[150px] min-w-0 flex-col rounded-card border border-line-subtle p-3.5 ${on ? "bg-surface" : "bg-canvas"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`flex size-8 items-center justify-center rounded-[9px] ${on ? TINT[WIDGETS[kind].topic] : "bg-raised text-ink-3"}`}>
                    <Icon className="size-[17px]" aria-hidden />
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={`${WIDGETS[kind].title} on ${TAB_LABELS[tab]}`}
                    onClick={() => toggle(kind)}
                    className="-my-2.5 -mr-0.5 flex h-11 w-11 items-center justify-end rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
                  >
                    <SwitchKnob on={on} />
                  </button>
                </div>
                <p className={`mt-3 text-sm font-semibold ${on ? "text-ink" : "text-ink-2"}`}>{WIDGETS[kind].title}</p>
                <p className="mt-0.5 text-xs text-ink-2">{WIDGETS[kind].about}</p>
                <div className="mt-auto flex items-center gap-1 pt-3">
                  <span className="mr-1 text-[11px] text-ink-3">Size</span>
                  {sizesOf(kind).map((size) => {
                    const chosen = on ? item.size === size : sizesOf(kind)[0] === size;
                    return (
                      <button
                        key={size}
                        type="button"
                        disabled={!on}
                        aria-pressed={on && chosen}
                        aria-label={`${SIZE_NAMES[size]}, ${FIELDS_OF[size]} ${FIELDS_OF[size] === 1 ? "field" : "fields"} wide`}
                        title={SIZE_NAMES[size]}
                        onClick={() => resize(kind, size)}
                        className={`h-7 min-w-[34px] rounded-full border px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 disabled:cursor-default ${
                          on && chosen ? "border-ink bg-ink text-white" : on ? "border-line bg-surface text-ink hover:bg-raised" : "border-line-subtle bg-transparent text-ink-3"
                        }`}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line-subtle px-5 py-3">
        <p role="status" className={`mr-auto min-w-0 text-[13px] ${message ? "text-danger" : "text-ink-2"}`}>
          {message || `${used} of ${FIELDS} fields used on ${TAB_LABELS[tab]}. New widgets go to the end of the tab.`}
        </p>
        <Button variant="ghost" onClick={() => send({ reset: true })} disabled={busy}>
          Reset
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={() => send({ layout: draft })} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
