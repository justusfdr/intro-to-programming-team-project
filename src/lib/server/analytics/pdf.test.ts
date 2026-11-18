// Tests for the PDF of a report (spec 49, "Export"): the answer is a real PDF, has several pages for a
// long period, keeps to the chosen parts, and never fails on text the standard fonts cannot print.
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { PARTS, type PeriodReport, type PeriodWeek } from "@/lib/analytics/period";
import type { GoalRef } from "@/lib/analytics/report-types";
import { addDays } from "@/lib/time/zoned";
import { periodText, renderReportPdf } from "./pdf";

const thesis: GoalRef = { id: "g1", title: "Thesis", color: "indigo", icon: "graduation" };
const run: GoalRef = { id: "g2", title: "Run 10k", color: "teal", icon: "footprints" };
const apps: GoalRef = { id: "g3", title: "Applications", color: "amber", icon: "briefcase" };

const week = (monday: string, focusedMinutes: number, sessions: number, score: number | null, attempts: number, reached: number): PeriodWeek => ({
  monday,
  focusedMinutes,
  sessions,
  averageSessionMinutes: sessions === 0 ? null : Math.round(focusedMinutes / sessions),
  score,
  attempts,
  doneMinutes: focusedMinutes + 120,
  goalsReached: reached,
  goalsJudged: 3,
});

/** Four weeks, 19 Oct to 15 Nov 2026, as on the mockup. */
export function sampleReport(): PeriodReport {
  const weeks = [week("2026-10-19", 545, 11, 74, 38, 1), week("2026-10-26", 470, 10, 71, 35, 1), week("2026-11-02", 580, 12, 76, 31, 2), week("2026-11-09", 690, 14, 82, 23, 2)];
  const goalWeeks = (texts: [string, "met" | "missed"][]) => texts.map(([text, status], i) => ({ monday: weeks[i].monday, text, status }));
  return {
    period: { from: "2026-10-19", to: "2026-11-09", weeks: 4 },
    createdOn: "2026-11-18",
    empty: false,
    weeks,
    totals: { focusedMinutes: 2285, sessions: 47, averageSessionMinutes: 49, score: 76, attempts: 127, doneMinutes: 2765, goalMinutes: 2320, activeDays: 23, days: 28 },
    before: { focusedMinutes: 1665, attempts: 171 },
    goals: [
      { goal: thesis, weeks: goalWeeks([["3 of 4", "missed"], ["3 of 4", "missed"], ["4 of 4", "met"], ["4 of 4", "met"]]), metWeeks: 2, judgedWeeks: 4 },
      { goal: run, weeks: goalWeeks([["2 of 3", "missed"], ["3 of 3", "met"], ["3 of 3", "met"], ["3 of 3", "met"]]), metWeeks: 3, judgedWeeks: 4 },
      { goal: apps, weeks: goalWeeks([["2 of 4", "missed"], ["1 of 4", "missed"], ["2 of 4", "missed"], ["2 of 4", "missed"]]), metWeeks: 0, judgedWeeks: 4 },
    ],
    goalWeeksMet: 5,
    goalWeeksJudged: 12,
    areas: [
      { goal: thesis, minutes: 1130 },
      { goal: null, minutes: 445 },
      { goal: run, minutes: 540 },
      { goal: apps, minutes: 290 },
    ],
    weekdays: [8, 8, 10, 7, 9, 1, 4],
    hours: [
      { block: "early", sessions: 6, score: 78 },
      { block: "morning", sessions: 15, score: 91 },
      { block: "midday", sessions: 12, score: 84 },
      { block: "afternoon", sessions: 8, score: 76 },
      { block: "late", sessions: 6, score: 64 },
    ],
    bestBlock: "morning",
    longest: { minutes: 95, date: "2026-11-15", goal: "Thesis" },
    topSites: [
      { domain: "instagram.com", count: 48 },
      { domain: "youtube.com", count: 34 },
      { domain: "linkedin.com", count: 19 },
      { domain: "reddit.com", count: 15 },
      { domain: "x.com", count: 11 },
    ],
    insights: {
      good: ["Focus time grew three weeks in a row: 7 h 50 min, 9 h 40 min, 11 h 30 min.", "Blocked visits fell from 38 to 23 a week.", "Run 10k was reached three weeks in a row."],
      bad: ["Applications was not reached in any of the 4 weeks.", "Sessions that start after 4 pm score 64 on average, 27 below your mornings."],
      summary: "Four weeks with a clear upward trend. You focused 38 h 5 min in 47 sessions, 37% more than in the four weeks before, and your focus score rose from 74 to 82. Applications is the goal that keeps slipping.",
    },
  };
}

/** The same report stretched to `count` weeks ending 9 Nov 2026. */
function longReport(count: number): PeriodReport {
  const base = sampleReport();
  const weeks = Array.from({ length: count }, (_, i) => week(addDays("2026-11-09", -7 * (count - 1 - i)), 300 + ((i * 53) % 400), 6 + (i % 9), i % 7 === 3 ? null : 60 + ((i * 7) % 35), 20 + ((i * 11) % 30), i % 4));
  return {
    ...base,
    period: { from: weeks[0].monday, to: "2026-11-09", weeks: count },
    weeks,
    goals: base.goals.map((goal, g) => ({
      ...goal,
      weeks: weeks.map((w, i) => ({ monday: w.monday, text: i < 3 && g === 2 ? null : "2 of 4", status: i < 3 && g === 2 ? null : (i + g) % 3 === 0 ? ("met" as const) : ("missed" as const) })),
      judgedWeeks: count,
    })),
  };
}

const pagesOf = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount();
const startsLikePdf = (bytes: Uint8Array) => new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";

describe("the PDF of a report", () => {
  it("is a PDF with more than one page for four weeks and every part", async () => {
    const bytes = await renderReportPdf(sampleReport(), PARTS);
    expect(startsLikePdf(bytes)).toBe(true);
    expect(await pagesOf(bytes)).toBeGreaterThanOrEqual(2);
  });

  it("has fewer pages when only one part is chosen", async () => {
    const all = await pagesOf(await renderReportPdf(sampleReport(), PARTS));
    const one = await pagesOf(await renderReportPdf(sampleReport(), ["productivity"]));
    expect(one).toBe(1);
    expect(one).toBeLessThan(all);
  });

  it("grows with the period: 26 weeks need more pages than 4, and the long table continues on a new page", async () => {
    const four = await pagesOf(await renderReportPdf(sampleReport(), PARTS));
    const long = await pagesOf(await renderReportPdf(longReport(26), PARTS));
    expect(long).toBeGreaterThan(four);
    expect(await pagesOf(await renderReportPdf(longReport(26), ["goals", "productivity"]))).toBeGreaterThanOrEqual(2);
  });

  it("draws every part alone, for 1, 8, 9 and 26 weeks", async () => {
    for (const count of [1, 8, 9, 26]) {
      for (const part of PARTS) {
        const bytes = await renderReportPdf(longReport(count), [part]);
        expect(startsLikePdf(bytes)).toBe(true);
      }
    }
  });

  it("is one page that says so when the period has nothing", async () => {
    const empty: PeriodReport = {
      ...sampleReport(),
      empty: true,
      weeks: sampleReport().weeks.map((w) => ({ ...w, focusedMinutes: 0, sessions: 0, averageSessionMinutes: null, score: null, attempts: 0, doneMinutes: 0, goalsReached: 0, goalsJudged: 0 })),
      totals: { focusedMinutes: 0, sessions: 0, averageSessionMinutes: null, score: null, attempts: 0, doneMinutes: 0, goalMinutes: 0, activeDays: 0, days: 28 },
      goals: [],
      areas: [],
      topSites: [],
      longest: null,
      bestBlock: null,
    };
    expect(await pagesOf(await renderReportPdf(empty, PARTS))).toBe(1);
  });

  it("draws a period with sessions but no goals, no done events and no blocked visits", async () => {
    const bare: PeriodReport = { ...sampleReport(), goals: [], goalWeeksMet: 0, goalWeeksJudged: 0, areas: [], topSites: [], totals: { ...sampleReport().totals, attempts: 0 }, before: { focusedMinutes: 0, attempts: 0 }, insights: { good: [], bad: [], summary: "A quiet period." } };
    expect(startsLikePdf(await renderReportPdf(bare, PARTS))).toBe(true);
  });

  it("does not fail on titles the standard fonts cannot print, or very long ones", async () => {
    const odd = sampleReport();
    odd.goals[0].goal = { ...thesis, title: "Thèse 📚 研究 — ".repeat(8) };
    odd.areas[0].goal = odd.goals[0].goal;
    odd.topSites[0].domain = "пример.рф";
    odd.longest = { minutes: 95, date: "2026-11-15", goal: "🏃 Run\nwith a line break" };
    odd.insights.summary = "Émoji 🎯 and “quotes” – with a dash… and a very long word: " + "x".repeat(300);
    expect(startsLikePdf(await renderReportPdf(odd, PARTS))).toBe(true);
  });

  it("names a period within a year once, and across New Year with both years", () => {
    expect(periodText("2026-10-19", "2026-11-15")).toBe("Oct 19 – Nov 15, 2026");
    expect(periodText("2026-12-21", "2027-01-17")).toBe("Dec 21, 2026 – Jan 17, 2027");
  });
});
