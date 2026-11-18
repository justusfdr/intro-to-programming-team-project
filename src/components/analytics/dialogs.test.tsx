// Spec 49: the two windows of the Analytics page as they open. "Export" offers the periods and one
// switch per part of the report, all on; "Edit widgets" shows the widgets the open tab may hold, which
// of them are on, their sizes and how many of the tab's 8 fields are used.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { widgetsFor } from "@/lib/analytics/layout";
import { PART_LABELS, PARTS } from "@/lib/analytics/period";
import { STANDARD_LAYOUT, TAB_LABELS, TABS, WIDGETS } from "@/lib/analytics/report-types";
import { EditWidgetsDialog } from "./EditWidgetsDialog";
import { ExportDialog, weekName } from "./ExportDialog";

const text = (markup: string) => markup.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const count = (markup: string, part: string) => markup.split(part).length - 1;

describe("Export window", () => {
  const open = renderToStaticMarkup(<ExportDialog open onClose={() => {}} thisWeek="2026-11-16" />);

  it("shows nothing while it is closed", () => {
    expect(text(renderToStaticMarkup(<ExportDialog open={false} onClose={() => {}} thisWeek="2026-11-16" />)).trim()).toBe("");
  });

  it("offers last week, the last 4 and 8 weeks and a custom period, with the last 4 weeks chosen", () => {
    const shown = text(open);
    for (const label of ["Last week", "Last 4 weeks", "Last 8 weeks", "Custom"]) expect(shown).toContain(label);
    expect(count(open, 'aria-pressed="true"')).toBe(1);
    expect(open).toMatch(/aria-pressed="true"[^>]*>Last 4 weeks/);
    // Four whole weeks that are over: 19 October to 15 November.
    expect(open).toMatch(/<option value="2026-10-19" selected="">W43 · Oct 19 – 25<\/option>/);
    expect(open).toMatch(/<option value="2026-11-09" selected="">W46 · Nov 9 – 15<\/option>/);
    expect(shown).toContain("4 weeks · 6 parts · PDF");
  });

  it("has one switch per part, all on, and no travel time", () => {
    const shown = text(open);
    for (const part of PARTS) {
      expect(shown).toContain(PART_LABELS[part].title);
      expect(shown).toContain(PART_LABELS[part].about);
    }
    expect(count(open, 'role="switch"')).toBe(PARTS.length);
    expect(count(open, 'aria-checked="true"')).toBe(PARTS.length);
    expect(shown).not.toContain("Travel");
  });

  it("offers the current week and the 51 before it, and can create the PDF", () => {
    expect(open).toContain('<option value="2026-11-16">W47 · Nov 16 – 22</option>');
    expect(open).toContain('value="2025-11-24"');
    expect(open).not.toContain('value="2025-11-17"');
    expect(text(open)).toContain("Create PDF");
    expect(open).not.toMatch(/disabled=""[^>]*>(<svg[^>]*>.*?<\/svg>)?Create PDF/);
  });
});

describe("Export week labels", () => {
  it("add the year only for weeks outside the current year", () => {
    expect(weekName("2026-11-16", "2026-11-16")).toBe("W47 · Nov 16 – 22");
    expect(weekName("2025-11-24", "2026-11-16")).toBe("W48 · Nov 24 – 30, 2025");
    const open = renderToStaticMarkup(<ExportDialog open onClose={() => {}} thisWeek="2026-11-16" />);
    expect(open).toContain('<option value="2025-11-24">W48 · Nov 24 – 30, 2025</option>');
    expect(open).toContain('<option value="2026-01-05">W2 · Jan 5 – 11</option>');
  });
});

describe("Edit widgets window", () => {
  const openOn = (tab: (typeof TABS)[number]) => renderToStaticMarkup(<EditWidgetsDialog open onClose={() => {}} layout={STANDARD_LAYOUT} firstTab={tab} onSaved={() => {}} />);

  it("shows nothing while it is closed", () => {
    const closed = renderToStaticMarkup(<EditWidgetsDialog open={false} onClose={() => {}} layout={STANDARD_LAYOUT} firstTab="focus" onSaved={() => {}} />);
    expect(text(closed).trim()).toBe("");
  });

  it("lists the six tabs with the fields each uses, and opens on the page's tab", () => {
    const open = openOn("goals");
    const shown = text(open);
    for (const tab of TABS) expect(shown).toContain(`${TAB_LABELS[tab]} 8/8`);
    expect(open).toMatch(/role="tab" aria-selected="true"[^>]*>Goals/);
    expect(shown).toContain("8 of 8 fields used on Goals");
  });

  it("shows every widget the tab may hold, the ones on the page switched on", () => {
    for (const tab of TABS) {
      const open = openOn(tab);
      const shown = text(open);
      for (const kind of widgetsFor(tab)) expect(shown).toContain(WIDGETS[kind].title);
      expect(count(open, 'role="switch"')).toBe(widgetsFor(tab).length);
      expect(count(open, 'aria-checked="true"')).toBe(STANDARD_LAYOUT[tab].length);
    }
  });

  it("keeps a tab to its own widgets, and lets the Overview hold any", () => {
    expect(text(openOn("focus"))).not.toContain(WIDGETS.top_sites.title);
    expect(text(openOn("overview"))).toContain(WIDGETS.top_sites.title);
  });

  it("marks the size a widget has, and offers only the sizes it comes in", () => {
    const open = openOn("goals");
    // "Plan, day by day" is large on the Goals tab and also comes in medium, never in small.
    const card = open.slice(open.indexOf(WIDGETS.plan.title), open.indexOf(WIDGETS.slipped.title));
    expect(card).toMatch(/aria-pressed="true" aria-label="Large, 3 fields wide"/);
    expect(card).toMatch(/aria-pressed="false" aria-label="Medium, 2 fields wide"/);
    expect(card).not.toContain("Small, 1 field wide");
  });

  it("has Reset, Cancel and Save", () => {
    const shown = text(openOn("focus"));
    for (const label of ["Reset", "Cancel", "Save"]) expect(shown).toContain(label);
  });
});
