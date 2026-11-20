// "Look back" (spec 62): the Analytics page, its Export window with a period and the parts of the
// report, and the PDF that comes out. Decoration: what it shows stands in the words next to it.
import { Check, Download, FileText } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import { timing } from "./parts";

/** The moments of the scene, in milliseconds after it starts. */
const PRESS_EXPORT = 900;
const WINDOW = 1150;
const PRESS_CREATE = 2750;
const CLOSED = 3000;
const PAGES = 3100;
const SAVED = 3950;

const STATS = [
  { label: "Focused this week", value: "7 h 40 min" },
  { label: "Focus score", value: "86" },
  { label: "Blocked attempts", value: "14" },
];

/** Hours per day for the thesis, running and Portuguese, in pixels of bar height. */
const DAYS = [
  { day: "M", bars: [34, 18, 0] },
  { day: "T", bars: [46, 0, 12] },
  { day: "W", bars: [24, 22, 8] },
  { day: "T", bars: [52, 14, 0] },
  { day: "F", bars: [30, 10, 14] },
  { day: "S", bars: [0, 26, 0] },
  { day: "S", bars: [10, 0, 0] },
];
const BAR_COLORS = ["bg-indigo-400", "bg-teal-400", "bg-amber-400"];
const LEGEND = ["Thesis", "Running", "Portuguese"];

const PERIODS = ["Last week", "Last 4 weeks", "Last 8 weeks"];
const PARTS = ["Summary", "Goals", "Productivity"];

/** The three pages that come out: how far each is turned and moved from the middle. */
const SHEETS = [
  { turn: "-rotate-[7deg] -translate-x-[74px] translate-y-2", lines: [70, 92, 56] },
  { turn: "", lines: [84, 60, 76] },
  { turn: "rotate-[7deg] translate-x-[74px] translate-y-2", lines: [64, 88, 48] },
];

function Sheet({ lines, first }: { lines: number[]; first: boolean }) {
  return (
    <div className="flex h-[112px] w-[84px] flex-col gap-1.5 rounded-md border border-line bg-surface p-2.5 shadow-float">
      <span className="h-1.5 w-10 rounded-full bg-ink" />
      {first ? (
        <span className="mt-0.5 flex h-9 items-end gap-1">
          {[14, 26, 18, 32, 22].map((height, index) => (
            <span key={index} className="flex-1 rounded-sm bg-indigo-300" style={{ height }} />
          ))}
        </span>
      ) : (
        <span className="mt-0.5 h-9 rounded-sm bg-raised" />
      )}
      {lines.map((width, index) => (
        <span key={index} className="h-1 rounded-full bg-muted" style={{ width: `${width}%` }} />
      ))}
    </div>
  );
}

export function ReportMock() {
  return (
    <div aria-hidden className="relative w-full max-w-[440px]">
      <div className="flex flex-col gap-3">
        {/* The Analytics page. */}
        <div className="l-rise rounded-card border border-line-subtle bg-surface p-4 shadow-float">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center text-[11px] font-medium text-ink-2">
              <span className="rounded-full bg-ink px-2.5 py-1 text-white">Overview</span>
              <span className="px-2 py-1">Focus</span>
              <span className="px-2 py-1">Goals</span>
              <span className="hidden px-2 py-1 sm:inline">Streaks</span>
            </span>
            <span className={`l-press ${buttonClass("secondary", "sm")}`} style={timing({ d: PRESS_EXPORT })}>
              <Download className="size-3.5" />
              Export
            </span>
          </div>

          <div className="mt-3 grid grid-cols-3 divide-x divide-line-subtle rounded-xl border border-line-subtle py-2.5">
            {STATS.map((stat) => (
              <div key={stat.label} className="px-3">
                <p className="text-[11px] leading-[14px] text-ink-3">{stat.label}</p>
                <p className="mt-1 text-[15px] font-semibold tracking-snug text-ink tabular">{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 flex h-[84px] items-end gap-2.5 px-1">
            {DAYS.map((day, index) => (
              <div key={index} className="l-raise flex flex-1 flex-col-reverse gap-0.5" style={timing({ d: 250 + index * 60 })}>
                {day.bars.map((height, goal) => (height ? <span key={goal} className={`rounded-[3px] ${BAR_COLORS[goal]}`} style={{ height }} /> : null))}
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-2.5 px-1 text-center text-[10px] text-ink-3">
            {DAYS.map((day, index) => (
              <span key={index} className="flex-1">
                {day.day}
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-3 text-[10px] text-ink-2">
            {LEGEND.map((name, goal) => (
              <span key={name} className="flex items-center gap-1">
                <span className={`size-1.5 rounded-full ${BAR_COLORS[goal]}`} />
                {name}
              </span>
            ))}
          </div>
        </div>

        {/* The PDF: three pages fan out, and the file is saved. */}
        <div className="relative h-[124px]">
          {SHEETS.map((sheet, index) => (
            <div key={index} className={`absolute left-1/2 top-0 -ml-[42px] ${sheet.turn} ${index === 1 ? "z-[1]" : ""}`}>
              <div className="l-rise" style={timing({ d: PAGES + index * 110 })}>
                <Sheet lines={sheet.lines} first={index === 1} />
              </div>
            </div>
          ))}
        </div>

        <div className="l-rise flex items-center gap-3 rounded-card border border-line-subtle bg-surface p-3 shadow-float" style={timing({ d: PAGES + 380 })}>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-danger-soft text-danger">
            <FileText className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold tracking-snug text-ink">report-2026-10-19-to-2026-11-15.pdf</p>
            <p className="text-[11px] text-ink-3">Last 4 weeks · PDF</p>
          </div>
          <span className="grid shrink-0 text-[12px] font-semibold">
            <span className="l-leave col-start-1 row-start-1 justify-self-end text-ink-3" style={timing({ out: SAVED })}>
              Saving
            </span>
            <span className="l-pop col-start-1 row-start-1 flex items-center gap-1 justify-self-end text-success" style={timing({ d: SAVED + 80 })}>
              <Check className="size-3.5" strokeWidth={3} />
              Saved
            </span>
          </span>
        </div>
      </div>

      {/* The Export window, over the page while it is open. */}
      <div className="l-ghost absolute inset-x-5 top-9 rounded-card border border-line-subtle bg-surface p-4 shadow-pop sm:inset-x-8" style={timing({ d: WINDOW, out: CLOSED })}>
        <p className="text-sm font-semibold tracking-snug text-ink">Export report</p>
        <p className="mt-0.5 text-[12px] text-ink-2">A PDF with your numbers, charts and a short summary.</p>
        <p className="mt-3 text-[11px] font-semibold text-ink-3">Period</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] font-medium">
          {PERIODS.map((period, index) => (
            <span key={period} className={`rounded-full px-2.5 py-1 ${index === 1 ? "bg-ink text-white" : "border border-line-subtle text-ink-2"}`}>
              {period}
            </span>
          ))}
        </div>
        <div className="mt-3 divide-y divide-line-subtle border-y border-line-subtle">
          {PARTS.map((part) => (
            <div key={part} className="flex h-8 items-center justify-between text-[12px] text-ink">
              {part}
              <span className="flex h-4 w-7 items-center justify-end rounded-full bg-ink px-0.5">
                <span className="size-3 rounded-full bg-white" />
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <span className={buttonClass("secondary", "sm")}>Cancel</span>
          <span className={`l-press ${buttonClass("primary", "sm")}`} style={timing({ d: PRESS_CREATE })}>
            <Download className="size-3.5" />
            Create PDF
          </span>
        </div>
      </div>
    </div>
  );
}
