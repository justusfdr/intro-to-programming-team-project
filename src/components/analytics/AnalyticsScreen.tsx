"use client";

// The Analytics page with its two windows (spec 49): the tabs and widgets (AnalyticsTabs), "Edit
// widgets" and "Export". It keeps the layout the page shows: the one the server sent, then the one the
// server saved after "Edit widgets", so a saved change shows at once without reading the numbers again.
import { useState } from "react";
import { TABS, type AnalyticsLayout, type AnalyticsReport, type Tab } from "@/lib/analytics/report-types";
import { AnalyticsTabs } from "./AnalyticsTabs";
import { EditWidgetsDialog } from "./EditWidgetsDialog";
import { ExportDialog } from "./ExportDialog";

/** The tab the address names right now (AnalyticsTabs keeps it there), or the Overview. */
function tabInAddress(): Tab {
  const named = new URLSearchParams(window.location.search).get("tab");
  return (TABS as readonly string[]).includes(named ?? "") ? (named as Tab) : "overview";
}

export function AnalyticsScreen({ report, layout: saved, tab }: { report: AnalyticsReport; layout: AnalyticsLayout; tab: Tab }) {
  const [layout, setLayout] = useState(saved);
  const [open, setOpen] = useState<"edit" | "export" | null>(null);
  const [editTab, setEditTab] = useState<Tab>(tab);

  return (
    <>
      <AnalyticsTabs
        report={report}
        layout={layout}
        tab={tab}
        onEdit={() => {
          setEditTab(tabInAddress());
          setOpen("edit");
        }}
        onExport={() => setOpen("export")}
      />
      <EditWidgetsDialog open={open === "edit"} onClose={() => setOpen(null)} layout={layout} firstTab={editTab} onSaved={setLayout} />
      <ExportDialog open={open === "export"} onClose={() => setOpen(null)} thisWeek={report.thisWeek} />
    </>
  );
}
