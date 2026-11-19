"use client";

// The Export window of the Analytics page (spec 49, "Export"): choose a period and the parts, then
// "Create PDF" asks the server for the file (GET /api/analytics/export) and hands it to the browser as
// a download. The same check as on the server (src/lib/analytics/period.ts) runs here first, so the
// button is only active for a request the server will accept; the server's answer still decides.
import { useMemo, useState } from "react";
import { ArrowRight, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { WidgetDialog } from "@/components/widgets/Dialog";
import { checkPeriod, lastDayOf, MAX_WEEKS, PART_LABELS, PARTS, presetPeriod, type Part } from "@/lib/analytics/period";
import { fmtWeekRange } from "@/lib/time/display";
import { addDays, isoWeekNumber, type LocalDate } from "@/lib/time/zoned";
import { Switch } from "./Switch";

const PRESETS = [
  { id: "w1", label: "Last week", weeks: 1 },
  { id: "w4", label: "Last 4 weeks", weeks: 4 },
  { id: "w8", label: "Last 8 weeks", weeks: 8 },
] as const;
type Choice = (typeof PRESETS)[number]["id"] | "custom";

const NETWORK_ERROR = "We could not reach the server. Check your connection and try again.";
/** "W48 · Nov 24 – 30"; weeks outside the current year get the year too ("…, 2025"). */
export const weekName = (monday: LocalDate, thisWeek: LocalDate) =>
  `W${isoWeekNumber(monday)} · ${fmtWeekRange(monday)}${monday.slice(0, 4) === thisWeek.slice(0, 4) ? "" : `, ${monday.slice(0, 4)}`}`;

/** The file name the server suggests, or one built from the period. */
function fileNameOf(response: Response, fallback: string): string {
  const match = /filename="([^"/\\]+\.pdf)"/.exec(response.headers.get("content-disposition") ?? "");
  return match ? match[1] : fallback;
}

/** Hands a file the page already holds to the browser as a download. */
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Safari needs the address a moment longer than the click.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function ExportDialog({ open, onClose, thisWeek }: { open: boolean; onClose: () => void; /** The Monday of the current week. */ thisWeek: LocalDate }) {
  const [choice, setChoice] = useState<Choice>("w4");
  const [custom, setCustom] = useState(() => presetPeriod(4, thisWeek));
  const [off, setOff] = useState<ReadonlySet<Part>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  // The weeks that can be picked: the current one and the 51 before it, newest first.
  const weeks = useMemo(() => Array.from({ length: 52 }, (_, i) => addDays(thisWeek, -7 * i)), [thisWeek]);

  const preset = PRESETS.find((p) => p.id === choice);
  const period = preset ? presetPeriod(preset.weeks, thisWeek) : custom;
  const parts = PARTS.filter((part) => !off.has(part));
  const checked = checkPeriod({ from: period.from, to: period.to, parts }, thisWeek);
  const count = checked.ok ? checked.period.weeks : 0;

  function pickWeek(edge: "from" | "to", monday: LocalDate) {
    setChoice("custom");
    setCustom({ ...period, [edge]: monday });
    setMessage("");
  }

  function toggle(part: Part) {
    const next = new Set(off);
    if (next.has(part)) next.delete(part);
    else next.add(part);
    setOff(next);
    setMessage("");
  }

  async function create() {
    if (!checked.ok || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const query = new URLSearchParams({ from: checked.period.from, to: checked.period.to, parts: checked.parts.join(",") });
      const response = await fetch(`/api/analytics/export?${query}`, { cache: "no-store" });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: unknown };
        setMessage(typeof data.message === "string" ? data.message : NETWORK_ERROR);
        return;
      }
      download(await response.blob(), fileNameOf(response, `report-${checked.period.from}-to-${lastDayOf(checked.period)}.pdf`));
      onClose();
    } catch {
      setMessage(NETWORK_ERROR);
    } finally {
      setBusy(false);
    }
  }

  const hint = !checked.ok ? checked.message : `${count} ${count === 1 ? "week" : "weeks"} · ${parts.length} ${parts.length === 1 ? "part" : "parts"} · PDF`;

  return (
    <WidgetDialog
      open={open}
      onClose={onClose}
      title="Export report"
      titleId="export-title"
      width="md:max-w-[560px]"
      footer={
        <>
          <p role="status" className={`mr-auto flex min-w-0 items-center gap-2 text-[13px] ${message || !checked.ok ? "text-danger" : "text-ink-2"}`}>
            <FileText className="size-4 shrink-0 text-ink-3" aria-hidden />
            <span className="min-w-0">{message || hint}</span>
          </p>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={create} disabled={!checked.ok || busy}>
            <Download className="size-4" aria-hidden />
            {busy ? "Creating…" : "Create PDF"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 px-5 pt-1 pb-5">
        <p className="text-[13px] text-ink-2">A PDF with your numbers, charts and a short summary.</p>

        <section aria-labelledby="export-period" className="flex flex-col gap-2.5">
          <h3 id="export-period" className="text-[11px] font-medium tracking-[0.08em] text-ink-3 uppercase">
            Period
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {[...PRESETS, { id: "custom" as const, label: "Custom", weeks: 0 }].map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant={choice === p.id ? "primary" : "secondary"}
                aria-pressed={choice === p.id}
                className="h-9 px-3.5 text-[13px]"
                onClick={() => {
                  // "Custom" starts from the period that was showing.
                  if (p.id === "custom") setCustom(period);
                  setChoice(p.id);
                  setMessage("");
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <WeekSelect label="From" value={period.from} weeks={weeks} thisWeek={thisWeek} onChange={(monday) => pickWeek("from", monday)} />
            <ArrowRight className="size-4 shrink-0 text-ink-3" aria-hidden />
            <WeekSelect label="To" value={period.to} weeks={weeks} thisWeek={thisWeek} onChange={(monday) => pickWeek("to", monday)} />
          </div>
          <p className="text-xs text-ink-3">Whole weeks, Monday to Sunday, at most {MAX_WEEKS}.</p>
        </section>

        <section aria-labelledby="export-parts" className="flex flex-col gap-2.5">
          <h3 id="export-parts" className="text-[11px] font-medium tracking-[0.08em] text-ink-3 uppercase">
            What to include
          </h3>
          <div className="overflow-hidden rounded-card border border-line-subtle">
            {PARTS.map((part) => (
              <Switch key={part} on={!off.has(part)} onToggle={() => toggle(part)} title={PART_LABELS[part].title} about={PART_LABELS[part].about} className="border-b border-line-subtle last:border-b-0" />
            ))}
          </div>
        </section>
      </div>
    </WidgetDialog>
  );
}

/** One end of the period: a labelled list of weeks. */
function WeekSelect({ label, value, weeks, thisWeek, onChange }: { label: string; value: LocalDate; weeks: LocalDate[]; thisWeek: LocalDate; onChange: (monday: LocalDate) => void }) {
  return (
    <label className="flex h-11 min-w-[190px] flex-1 items-center gap-2.5 rounded-xl border border-line px-3.5 focus-within:ring-2 focus-within:ring-ink/20">
      <span className="text-xs text-ink-3">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="tabular min-w-0 flex-1 cursor-pointer appearance-none bg-transparent text-sm font-medium text-ink focus:outline-none"
      >
        {/* A week outside the list (it cannot happen through the buttons) still shows. */}
        {!weeks.includes(value) && <option value={value}>{weekName(value, thisWeek)}</option>}
        {weeks.map((monday) => (
          <option key={monday} value={monday}>
            {weekName(monday, thisWeek)}
          </option>
        ))}
      </select>
    </label>
  );
}
