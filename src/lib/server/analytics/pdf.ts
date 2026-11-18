import "server-only";

// Draws a report over several weeks as a PDF (spec 49, "Export"). It only draws: every number comes
// ready from a PeriodReport (src/lib/analytics/period.ts), so the file can never show anything the
// Analytics page would not show. A4 pages, the two standard Helvetica fonts (nothing is loaded from
// outside), a foot on every page with "Page x of y". Tables and lists start a new page instead of
// being cut.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { APP_NAME } from "@/lib/app-name";
import type { Part, PeriodGoal, PeriodReport } from "@/lib/analytics/period";
import { lastDayOf } from "@/lib/analytics/period";
import { HOUR_BLOCKS } from "@/lib/analytics/report-types";
import { scoreText } from "@/lib/analytics/score";
import { minutesText } from "@/lib/focus/session-time";
import type { GoalColorName } from "@/lib/goals/style";
import { addDays, isoWeekNumber, type LocalDate } from "@/lib/time/zoned";

const WIDTH = 595.28;
const HEIGHT = 841.89;
const MARGIN = 48;
const INNER = WIDTH - 2 * MARGIN;
/** The lowest point content may reach; below it is the foot. */
const BOTTOM = HEIGHT - 58;
const TOP = 52;

const hex = (value: string): RGB => rgb(parseInt(value.slice(1, 3), 16) / 255, parseInt(value.slice(3, 5), 16) / 255, parseInt(value.slice(5, 7), 16) / 255);
const INK = hex("#101010");
const GREY = hex("#616165");
const LINE = hex("#e0e0e3");
const SOFT = hex("#dcdce0");
const RAISED = hex("#f6f6f7");
const WHITE = hex("#ffffff");
const GREEN = hex("#15803d");
const AMBER = hex("#b45309");
const ROSE = hex("#f43f5e");

/** The goal colours as the app shows them (the 500 shade of each). */
const GOAL_HEX: Record<GoalColorName, string> = {
  rose: "#f43f5e",
  teal: "#14b8a6",
  indigo: "#6366f1",
  amber: "#f59e0b",
  emerald: "#10b981",
  pink: "#ec4899",
  sky: "#0ea5e9",
  violet: "#8b5cf6",
  orange: "#f97316",
  slate: "#64748b",
};
const NO_GOAL = hex("#b9b9be");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const dayMonth = (date: LocalDate) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;
const fullDate = (date: LocalDate) => `${dayMonth(date)}, ${date.slice(0, 4)}`;
const weekLabel = (monday: LocalDate) => `W${isoWeekNumber(monday)}`;
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** "Oct 19 – Nov 15, 2026", with both years when the period crosses New Year. */
export function periodText(from: LocalDate, lastDay: LocalDate): string {
  return from.slice(0, 4) === lastDay.slice(0, 4) ? `${dayMonth(from)} – ${fullDate(lastDay)}` : `${fullDate(from)} – ${fullDate(lastDay)}`;
}

/** One week as a table row names it: "Oct 19 – 25" or "Oct 26 – Nov 1". */
function weekRange(monday: LocalDate): string {
  const sunday = addDays(monday, 6);
  return monday.slice(5, 7) === sunday.slice(5, 7) ? `${dayMonth(monday)} – ${Number(sunday.slice(8, 10))}` : `${dayMonth(monday)} – ${dayMonth(sunday)}`;
}

type Fonts = { regular: PDFFont; bold: PDFFont };
type TextStyle = { size?: number; bold?: boolean; color?: RGB; align?: "left" | "right" | "center"; width?: number };

/** The pages of one report and where the next thing goes (`y` counts down from the top of the page). */
class Sheet {
  page!: PDFPage;
  y = TOP;
  private readonly known: Set<number>;

  constructor(private readonly doc: PDFDocument, readonly fonts: Fonts) {
    this.known = new Set(fonts.regular.getCharacterSet());
    this.newPage();
  }

  newPage(): void {
    this.page = this.doc.addPage([WIDTH, HEIGHT]);
    this.y = TOP;
  }

  /** Starts a new page when the next `height` points do not fit; says whether it did. */
  need(height: number): boolean {
    if (this.y + height <= BOTTOM) return false;
    this.newPage();
    return true;
  }

  /** Text the standard fonts can print: anything else (emoji, other scripts) becomes "?", line breaks become spaces. */
  safe(text: string): string {
    let out = "";
    for (const char of text.replace(/\s+/g, " ")) out += this.known.has(char.codePointAt(0)!) ? char : "?";
    return out;
  }

  font(bold?: boolean): PDFFont {
    return bold ? this.fonts.bold : this.fonts.regular;
  }

  widthOf(text: string, size: number, bold?: boolean): number {
    return this.font(bold).widthOfTextAtSize(this.safe(text), size);
  }

  /** One line of text with its top at `top`. With `width`, right or centre alignment is inside that width from `x`, and a longer text is cut with "…". */
  text(text: string, x: number, top: number, style: TextStyle = {}): void {
    const size = style.size ?? 10;
    const font = this.font(style.bold);
    let line = this.safe(text);
    if (style.width !== undefined && font.widthOfTextAtSize(line, size) > style.width) {
      while (line.length > 1 && font.widthOfTextAtSize(`${line}…`, size) > style.width) line = line.slice(0, -1);
      line = `${line.trimEnd()}…`;
    }
    const lineWidth = font.widthOfTextAtSize(line, size);
    let left = x;
    if (style.align === "right") left = x + (style.width ?? 0) - lineWidth;
    if (style.align === "center") left = x + ((style.width ?? 0) - lineWidth) / 2;
    this.page.drawText(line, { x: left, y: HEIGHT - top - size * 0.8, size, font, color: style.color ?? INK });
  }

  /** Breaks a text into lines no wider than `width`. */
  wrap(text: string, width: number, size: number, bold?: boolean): string[] {
    const font = this.font(bold);
    const lines: string[] = [];
    let line = "";
    for (const word of this.safe(text).split(" ")) {
      const next = line === "" ? word : `${line} ${word}`;
      if (line !== "" && font.widthOfTextAtSize(next, size) > width) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line !== "") lines.push(line);
    return lines;
  }

  /** Wrapped text from `top`; returns the height it took. */
  paragraph(text: string, x: number, top: number, width: number, style: { size?: number; bold?: boolean; color?: RGB; leading?: number } = {}): number {
    const size = style.size ?? 10;
    const leading = style.leading ?? size * 1.45;
    const lines = this.wrap(text, width, size, style.bold);
    lines.forEach((line, i) => this.text(line, x, top + i * leading, { size, bold: style.bold, color: style.color }));
    return lines.length * leading;
  }

  /** A box with round corners. */
  box(x: number, top: number, width: number, height: number, options: { fill?: RGB; border?: RGB; radius?: number }): void {
    const r = Math.min(options.radius ?? 0, width / 2, height / 2);
    if (width <= 0 || height <= 0) return;
    const path = `M ${r} 0 H ${width - r} Q ${width} 0 ${width} ${r} V ${height - r} Q ${width} ${height} ${width - r} ${height} H ${r} Q 0 ${height} 0 ${height - r} V ${r} Q 0 0 ${r} 0 Z`;
    this.page.drawSvgPath(path, { x, y: HEIGHT - top, color: options.fill, borderColor: options.border, borderWidth: options.border ? 0.8 : 0 });
  }

  dot(cx: number, centerTop: number, radius: number, color: RGB): void {
    this.page.drawCircle({ x: cx, y: HEIGHT - centerTop, size: radius, color });
  }

  rule(x: number, top: number, width: number, color: RGB = LINE, dashed = false): void {
    this.page.drawLine({ start: { x, y: HEIGHT - top }, end: { x: x + width, y: HEIGHT - top }, thickness: 0.8, color, dashArray: dashed ? [3, 3] : undefined });
  }

  segment(x1: number, top1: number, x2: number, top2: number, color: RGB, thickness = 1.6): void {
    this.page.drawLine({ start: { x: x1, y: HEIGHT - top1 }, end: { x: x2, y: HEIGHT - top2 }, thickness, color });
  }

  /** A section heading with an optional grey line under it; keeps it together with `keep` points of what follows. */
  heading(title: string, note?: string, keep = 60): void {
    this.need(34 + keep);
    this.text(title, MARGIN, this.y, { size: 17, bold: true });
    this.y += 24;
    if (note) this.y += this.paragraph(note, MARGIN, this.y, INNER, { size: 9.5, color: GREY }) + 4;
    this.y += 6;
  }

  subheading(title: string, keep = 40): void {
    this.need(22 + keep);
    this.text(title, MARGIN, this.y, { size: 12, bold: true });
    this.y += 20;
  }
}

const goalColor = (goal: { color: GoalColorName } | null): RGB => (goal ? hex(GOAL_HEX[goal.color]) : NO_GOAL);

function head(sheet: Sheet, report: PeriodReport): void {
  const { period } = report;
  sheet.box(MARGIN, TOP - 4, 18, 18, { fill: INK, radius: 5 });
  sheet.dot(MARGIN + 9, TOP + 5, 3.2, WHITE);
  sheet.text(APP_NAME, MARGIN + 24, TOP, { size: 11, bold: true });
  sheet.text(`Created ${fullDate(report.createdOn)}`, MARGIN, TOP + 1, { size: 9, color: GREY, align: "right", width: INNER });

  sheet.text("Focus report", MARGIN, TOP + 34, { size: 28, bold: true });
  const weeks = period.weeks === 1 ? `1 week (${weekLabel(period.from)})` : `${period.weeks} weeks (${weekLabel(period.from)} – ${weekLabel(period.to)})`;
  sheet.text(`${periodText(period.from, lastDayOf(period))} · ${weeks}`, MARGIN, TOP + 70, { size: 12, color: GREY });
  sheet.y = TOP + 104;
}

function summary(sheet: Sheet, report: PeriodReport): void {
  const { totals, insights, period } = report;

  // The summary sentence in a soft box.
  const lines = sheet.wrap(insights.summary, INNER - 32, 11.5);
  const boxHeight = 30 + lines.length * 16.5 + 10;
  sheet.need(boxHeight + 90);
  sheet.box(MARGIN, sheet.y, INNER, boxHeight, { fill: RAISED, radius: 12 });
  sheet.text("SUMMARY", MARGIN + 16, sheet.y + 14, { size: 7.5, bold: true, color: GREY });
  lines.forEach((line, i) => sheet.text(line, MARGIN + 16, sheet.y + 30 + i * 16.5, { size: 11.5 }));
  sheet.y += boxHeight + 14;

  // Four numbers.
  const growth = report.before.focusedMinutes > 0 ? Math.round((100 * (totals.focusedMinutes - report.before.focusedMinutes)) / report.before.focusedMinutes) : null;
  const first = report.weeks.find((w) => w.score !== null)?.score ?? null;
  const last = [...report.weeks].reverse().find((w) => w.score !== null)?.score ?? null;
  const tiles: { label: string; value: string; note: string; good?: boolean }[] = [
    {
      label: "Focus time",
      value: minutesText(totals.focusedMinutes),
      note: growth === null ? `in ${plural(totals.sessions, "session")}` : growth >= 0 ? `${growth}% more than before` : `${-growth}% less than before`,
      good: growth !== null && growth > 0,
    },
    { label: "Focus sessions", value: String(totals.sessions), note: totals.averageSessionMinutes === null ? "none finished" : `${minutesText(totals.averageSessionMinutes)} on average` },
    {
      label: "Focus score",
      value: scoreText(totals.score),
      note: first !== null && last !== null && period.weeks > 1 ? `from ${first} to ${last}` : "of 100",
      good: first !== null && last !== null && last > first,
    },
    {
      label: "Goals reached",
      value: report.goalWeeksJudged === 0 ? "–" : `${report.goalWeeksMet} of ${report.goalWeeksJudged}`,
      note: report.goalWeeksJudged === 0 ? "no goals with rules" : `${plural(report.goals.length, "goal")} over ${plural(period.weeks, "week")}`,
    },
  ];
  const gap = 10;
  const tileWidth = (INNER - 3 * gap) / 4;
  tiles.forEach((tile, i) => {
    const x = MARGIN + i * (tileWidth + gap);
    sheet.box(x, sheet.y, tileWidth, 66, { border: LINE, radius: 10 });
    sheet.text(tile.label, x + 11, sheet.y + 11, { size: 8.5, color: GREY });
    sheet.text(tile.value, x + 11, sheet.y + 26, { size: 16, bold: true, width: tileWidth - 22 });
    sheet.text(tile.note, x + 11, sheet.y + 49, { size: 7.5, color: tile.good ? GREEN : GREY, bold: tile.good, width: tileWidth - 22 });
  });
  sheet.y += 66 + 16;

  // What went well, what did not.
  if (insights.good.length === 0 && insights.bad.length === 0) return;
  const columnWidth = (INNER - 14) / 2;
  const columns = [
    { title: "What went well", items: insights.good, color: GREEN, none: "Nothing stood out this time." },
    { title: "What did not go well", items: insights.bad, color: AMBER, none: "Nothing to worry about." },
  ];
  const heights = columns.map((column) => {
    const items = column.items.length > 0 ? column.items : [column.none];
    return 38 + items.reduce((sum, item) => sum + sheet.wrap(item, columnWidth - 40, 9.5).length * 13.5 + 6, 0) + 6;
  });
  const height = Math.max(...heights);
  sheet.need(height + 10);
  columns.forEach((column, i) => {
    const x = MARGIN + i * (columnWidth + 14);
    sheet.box(x, sheet.y, columnWidth, height, { border: LINE, radius: 12 });
    sheet.dot(x + 19, sheet.y + 19, 4, column.color);
    sheet.text(column.title, x + 30, sheet.y + 13, { size: 11, bold: true });
    let top = sheet.y + 38;
    for (const item of column.items.length > 0 ? column.items : [column.none]) {
      sheet.dot(x + 19, top + 5.5, 1.4, GREY);
      top += sheet.paragraph(item, x + 30, top, columnWidth - 40, { size: 9.5, leading: 13.5, color: column.items.length > 0 ? INK : GREY }) + 6;
    }
  });
  sheet.y += height + 22;
}

function goals(sheet: Sheet, report: PeriodReport): void {
  sheet.heading("Goals", "Sessions or hours done of the weekly target. Bold means the goal was reached that week.", Math.min(420, 50 + report.goals.length * 23));
  if (report.goals.length === 0) {
    sheet.text("No goals with weekly rules in this period.", MARGIN, sheet.y, { size: 10, color: GREY });
    sheet.y += 26;
    return;
  }
  const perWeek = report.period.weeks <= 8;
  const totalWidth = 92;
  const cellWidth = perWeek ? Math.min(52, (INNER - 150 - totalWidth) / report.period.weeks) : 0;
  const nameWidth = perWeek ? INNER - totalWidth - cellWidth * report.period.weeks : 150;
  const stripX = MARGIN + nameWidth;

  const header = () => {
    sheet.text("Goal", MARGIN, sheet.y, { size: 8.5, color: GREY });
    if (perWeek) report.weeks.forEach((week, i) => sheet.text(weekLabel(week.monday), stripX + i * cellWidth, sheet.y, { size: 8.5, color: GREY, align: "right", width: cellWidth - 4 }));
    else sheet.text(`${weekLabel(report.period.from)} to ${weekLabel(report.period.to)}, one square a week`, stripX, sheet.y, { size: 8.5, color: GREY });
    sheet.text("Reached", MARGIN + INNER - totalWidth, sheet.y, { size: 8.5, color: GREY, align: "right", width: totalWidth });
    sheet.y += 14;
    sheet.rule(MARGIN, sheet.y, INNER);
    sheet.y += 7;
  };
  const row = (goal: PeriodGoal) => {
    if (sheet.need(22)) header();
    sheet.dot(MARGIN + 4, sheet.y + 5.5, 3.2, goalColor(goal.goal));
    sheet.text(goal.goal.title, MARGIN + 13, sheet.y, { size: 10, bold: true, width: nameWidth - 20 });
    if (perWeek) {
      goal.weeks.forEach((week, i) => {
        const met = week.status === "met";
        sheet.text(week.text ?? "–", stripX + i * cellWidth, sheet.y, { size: 9.5, bold: met, color: met ? INK : GREY, align: "right", width: cellWidth - 4 });
      });
    } else {
      goal.weeks.forEach((week, i) => {
        const x = stripX + i * 11;
        if (week.status === "met") sheet.box(x, sheet.y + 1, 9, 9, { fill: goalColor(goal.goal), radius: 2 });
        else if (week.status === null) sheet.box(x, sheet.y + 1, 9, 9, { fill: RAISED, radius: 2 });
        else sheet.box(x + 0.4, sheet.y + 1.4, 8.2, 8.2, { border: SOFT, radius: 2 });
      });
    }
    const reached = goal.judgedWeeks === 0 ? "–" : `${goal.metWeeks} of ${plural(goal.judgedWeeks, "week")}`;
    sheet.text(reached, MARGIN + INNER - totalWidth, sheet.y, { size: 9.5, align: "right", width: totalWidth });
    sheet.y += 16;
    sheet.rule(MARGIN, sheet.y, INNER, hex("#ededef"));
    sheet.y += 7;
  };

  header();
  report.goals.forEach(row);
  if (perWeek) {
    sheet.need(20);
    sheet.text("Goals reached", MARGIN, sheet.y, { size: 10, bold: true });
    report.weeks.forEach((week, i) => sheet.text(week.goalsJudged === 0 ? "–" : `${week.goalsReached} of ${week.goalsJudged}`, stripX + i * cellWidth, sheet.y, { size: 9.5, bold: true, align: "right", width: cellWidth - 4 }));
    sheet.text(`${report.goalWeeksMet} of ${report.goalWeeksJudged}`, MARGIN + INNER - totalWidth, sheet.y, { size: 9.5, bold: true, align: "right", width: totalWidth });
    sheet.y += 16;
  } else {
    sheet.text("Filled: reached. Outlined: not reached. Grey: not judged (before the goal started or after its deadline).", MARGIN, sheet.y, { size: 8, color: GREY });
    sheet.y += 14;
  }
  sheet.y += 18;
}

function productivity(sheet: Sheet, report: PeriodReport): void {
  sheet.heading("Productivity", "Finished focus sessions. The focus score compares focused with planned minutes, minus 5 for each blocked visit.", Math.min(420, 50 + report.weeks.length * 22));
  const columns = [
    { title: "Week", width: INNER - 5 * 68 },
    { title: "Focus time", width: 68 },
    { title: "Sessions", width: 68 },
    { title: "Avg. session", width: 68 },
    { title: "Focus score", width: 68 },
    { title: "Blocked visits", width: 68 },
  ];
  const cells = (values: string[], top: number, bold: boolean, firstColor?: RGB) => {
    let x = MARGIN;
    values.forEach((value, i) => {
      if (i === 0) sheet.text(value, x, top, { size: 9.5, bold, color: firstColor, width: columns[0].width - 6 });
      else sheet.text(value, x, top, { size: 9.5, bold, align: "right", width: columns[i].width });
      x += columns[i].width;
    });
  };
  const header = () => {
    let x = MARGIN;
    columns.forEach((column, i) => {
      sheet.text(column.title, x, sheet.y, { size: 8.5, color: GREY, align: i === 0 ? "left" : "right", width: column.width });
      x += column.width;
    });
    sheet.y += 14;
    sheet.rule(MARGIN, sheet.y, INNER);
    sheet.y += 7;
  };

  header();
  for (const week of report.weeks) {
    if (sheet.need(22)) header();
    const name = `${weekLabel(week.monday)}  ${weekRange(week.monday)}`;
    cells(
      [name, minutesText(week.focusedMinutes), String(week.sessions), week.averageSessionMinutes === null ? "–" : minutesText(week.averageSessionMinutes), scoreText(week.score), String(week.attempts)],
      sheet.y,
      false,
    );
    sheet.y += 15;
    sheet.rule(MARGIN, sheet.y, INNER, hex("#ededef"));
    sheet.y += 7;
  }
  sheet.need(20);
  const { totals } = report;
  cells(
    [
      report.period.weeks === 1 ? "This week" : `All ${report.period.weeks} weeks`,
      minutesText(totals.focusedMinutes),
      String(totals.sessions),
      totals.averageSessionMinutes === null ? "–" : minutesText(totals.averageSessionMinutes),
      scoreText(totals.score),
      String(totals.attempts),
    ],
    sheet.y,
    true,
  );
  sheet.y += 34;
}

function timeFacts(sheet: Sheet, report: PeriodReport): void {
  sheet.heading("Time facts", "Where your time went counts the events you marked done.", 80);
  if (report.areas.length === 0) {
    sheet.text("No events were marked done in this period.", MARGIN, sheet.y, { size: 10, color: GREY });
    sheet.y += 24;
  } else {
    // One bar, a piece per goal, then the names with their hours.
    const total = report.areas.reduce((sum, area) => sum + area.minutes, 0);
    let x = MARGIN;
    report.areas.forEach((area, i) => {
      const width = Math.max(2, ((INNER - 2 * (report.areas.length - 1)) * area.minutes) / total);
      sheet.box(x, sheet.y, i === report.areas.length - 1 ? MARGIN + INNER - x : width, 10, { fill: goalColor(area.goal), radius: 3 });
      x += width + 2;
    });
    sheet.y += 22;
    const perRow = 3;
    const cell = INNER / perRow;
    report.areas.forEach((area, i) => {
      if (i % perRow === 0 && i > 0) sheet.y += 28;
      if (i % perRow === 0) sheet.need(30);
      const left = MARGIN + (i % perRow) * cell;
      sheet.dot(left + 4, sheet.y + 5, 3.2, goalColor(area.goal));
      sheet.text(area.goal?.title ?? "No goal", left + 13, sheet.y, { size: 9.5, bold: true, width: cell - 22 });
      sheet.text(minutesText(area.minutes), left + 13, sheet.y + 13, { size: 9, color: GREY });
    });
    sheet.y += 42;
  }

  const { totals } = report;
  const topWeekday = report.weekdays.reduce((best, count, day) => (count > report.weekdays[best] ? day : best), 0);
  const block = report.bestBlock ? HOUR_BLOCKS.find((b) => b.id === report.bestBlock)! : null;
  const blockScore = report.bestBlock ? (report.hours.find((h) => h.block === report.bestBlock)?.score ?? null) : null;
  const facts: { label: string; value: string; note: string }[] = [
    { label: "Most focused weekday", value: totals.sessions === 0 ? "–" : WEEKDAYS[topWeekday], note: totals.sessions === 0 ? "" : plural(report.weekdays[topWeekday], "session") },
    { label: "Best hours", value: block ? block.label : "–", note: block && blockScore !== null ? `Score ${blockScore} on average` : "" },
    {
      label: "Longest session",
      value: report.longest ? minutesText(report.longest.minutes) : "–",
      note: report.longest ? `${dayMonth(report.longest.date)}${report.longest.goal ? ` · ${report.longest.goal}` : ""}` : "",
    },
    { label: "Days with focus", value: `${totals.activeDays} of ${totals.days}`, note: "" },
  ];
  sheet.need(52);
  sheet.rule(MARGIN, sheet.y, INNER);
  sheet.y += 12;
  const cell = INNER / 4;
  facts.forEach((fact, i) => {
    const x = MARGIN + i * cell;
    sheet.text(fact.label, x, sheet.y, { size: 8.5, color: GREY });
    sheet.text(fact.value, x, sheet.y + 13, { size: 11, bold: true, width: cell - 10 });
    if (fact.note) sheet.text(fact.note, x, sheet.y + 28, { size: 8.5, color: GREY, width: cell - 10 });
  });
  sheet.y += 60;
}

/** Bars with a value above and a name below each; `labels` every `step`-th when there are many. */
function barChart(sheet: Sheet, bars: { name: string; value: number; text: string; strong?: boolean; color?: RGB }[], height: number, options: { x?: number; width?: number } = {}): void {
  const x0 = options.x ?? MARGIN;
  const width = options.width ?? INNER;
  const max = Math.max(1, ...bars.map((bar) => bar.value));
  const many = bars.length > 13;
  const slot = width / bars.length;
  const barWidth = Math.min(56, slot - (many ? 4 : 10));
  const floor = sheet.y + height + 12;
  bars.forEach((bar, i) => {
    const x = x0 + i * slot + (slot - barWidth) / 2;
    const h = bar.value === 0 ? 1.5 : Math.max(2, (bar.value / max) * height);
    sheet.box(x, floor - h, barWidth, h, { fill: bar.color ?? (bar.strong ? INK : SOFT), radius: Math.min(3, barWidth / 3) });
    if (!many) sheet.text(bar.text, x0 + i * slot, floor - h - 11, { size: 7.5, color: bar.strong ? INK : GREY, bold: bar.strong, align: "center", width: slot });
    if (!many || i % 2 === 0 || i === bars.length - 1) sheet.text(bar.name, x0 + i * slot, floor + 5, { size: 7.5, color: GREY, align: "center", width: slot });
  });
  sheet.y = floor + 22;
}

function trends(sheet: Sheet, report: PeriodReport): void {
  sheet.heading("Trends", undefined, 170);
  const lastIndex = report.weeks.length - 1;

  sheet.subheading("Focus time per week", 150);
  barChart(sheet, report.weeks.map((week, i) => ({ name: weekLabel(week.monday), value: week.focusedMinutes, text: week.focusedMinutes === 0 ? "–" : minutesText(week.focusedMinutes), strong: i === lastIndex })), 96);

  // The focus score as a line; weeks without a session have no point.
  sheet.subheading("Focus score per week", 120);
  const height = 70;
  const floor = sheet.y + height + 12;
  const step = report.weeks.length > 1 ? INNER / report.weeks.length : INNER;
  const points = report.weeks.map((week, i) => (week.score === null ? null : { x: MARGIN + step * (i + 0.5), top: floor - (week.score / 100) * height, score: week.score, name: weekLabel(week.monday), index: i }));
  sheet.rule(MARGIN, floor, INNER);
  const drawn = points.filter((p): p is NonNullable<typeof p> => p !== null);
  drawn.forEach((point, i) => {
    if (i > 0) sheet.segment(drawn[i - 1].x, drawn[i - 1].top, point.x, point.top, INK);
  });
  const many = report.weeks.length > 13;
  drawn.forEach((point) => {
    sheet.dot(point.x, point.top, 2.8, INK);
    if (!many) sheet.text(String(point.score), point.x - 15, point.top - 13, { size: 7.5, color: GREY, align: "center", width: 30 });
  });
  report.weeks.forEach((week, i) => {
    if (!many || i % 2 === 0 || i === lastIndex) sheet.text(weekLabel(week.monday), MARGIN + step * i, floor + 5, { size: 7.5, color: GREY, align: "center", width: step });
  });
  if (drawn.length === 0) sheet.text("No finished sessions in this period.", MARGIN, sheet.y + 26, { size: 9.5, color: GREY });
  sheet.y = floor + 26;

  sheet.subheading("Focus sessions by weekday", 110);
  const top = Math.max(...report.weekdays);
  barChart(sheet, report.weekdays.map((count, day) => ({ name: WEEKDAYS_SHORT[day], value: count, text: String(count), strong: count > 0 && count === top })), 64);
  sheet.y += 8;
}

function blocked(sheet: Sheet, report: PeriodReport): void {
  const { totals, period } = report;
  const change = report.before.attempts > 0 || totals.attempts > 0 ? ` The ${plural(period.weeks, "week")} before had ${report.before.attempts}.` : "";
  sheet.heading("Blocked sites", `${plural(totals.attempts, "blocked visit")} in ${plural(period.weeks, "week")}.${change}`, 100);
  if (totals.attempts === 0) {
    sheet.text("No site was blocked in this period.", MARGIN, sheet.y, { size: 10, color: GREY });
    sheet.y += 24;
    return;
  }
  if (period.weeks > 1) {
    const lastIndex = report.weeks.length - 1;
    barChart(sheet, report.weeks.map((week, i) => ({ name: weekLabel(week.monday), value: week.attempts, text: String(week.attempts), strong: i === lastIndex })), 56);
  }
  sheet.subheading("The sites that pulled at you most", 30);
  const max = Math.max(1, ...report.topSites.map((site) => site.count));
  for (const site of report.topSites) {
    sheet.need(18);
    sheet.text(site.domain, MARGIN, sheet.y, { size: 9.5, width: 150 });
    sheet.box(MARGIN + 160, sheet.y + 3, INNER - 200, 5, { fill: RAISED, radius: 2.5 });
    sheet.box(MARGIN + 160, sheet.y + 3, Math.max(5, ((INNER - 200) * site.count) / max), 5, { fill: ROSE, radius: 2.5 });
    sheet.text(String(site.count), MARGIN + INNER - 34, sheet.y, { size: 9.5, color: GREY, align: "right", width: 34 });
    sheet.y += 17;
  }
  sheet.y += 14;
}

const DRAW: Record<Part, (sheet: Sheet, report: PeriodReport) => void> = { summary, goals, productivity, time: timeFacts, trends, blocked };

/** The report as the bytes of a PDF file, with the chosen parts in their fixed order. */
export async function renderReportPdf(report: PeriodReport, parts: readonly Part[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${APP_NAME} focus report`);
  doc.setCreator(APP_NAME);
  doc.setProducer(APP_NAME);
  const fonts: Fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  const sheet = new Sheet(doc, fonts);

  head(sheet, report);
  if (report.empty) {
    sheet.paragraph("Nothing was recorded in this period: no focus sessions, no events marked done and no blocked visits.", MARGIN, sheet.y, INNER, { size: 11, color: GREY });
  } else {
    for (const part of parts) DRAW[part](sheet, report);
  }

  // The foot, once the number of pages is known.
  const pages = doc.getPages();
  const range = periodText(report.period.from, lastDayOf(report.period));
  pages.forEach((page, i) => {
    sheet.page = page;
    sheet.text(`${APP_NAME} · Focus report · ${range}`, MARGIN, HEIGHT - 40, { size: 8, color: GREY });
    sheet.text(`Page ${i + 1} of ${pages.length}`, MARGIN, HEIGHT - 40, { size: 8, color: GREY, align: "right", width: INNER });
  });

  return doc.save();
}
