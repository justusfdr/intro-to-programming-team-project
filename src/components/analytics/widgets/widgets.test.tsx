// Spec 49: what every Analytics widget shows for the mockup's sample week and for a new account, in
// every size it comes in and drawn large in its details.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { emptyReport, sampleReport } from "@/lib/analytics/report-fixture";
import { WIDGET_KINDS, WIDGETS, type AnalyticsReport, type Size, type WidgetKind } from "@/lib/analytics/report-types";
import { WIDGET_COMPONENTS } from "./index";

function html(kind: WidgetKind, report: AnalyticsReport, size: Size = WIDGETS[kind].sizes[0], hero = false): string {
  const Widget = WIDGET_COMPONENTS[kind];
  return renderToStaticMarkup(<Widget report={report} size={size} hero={hero} onOpen={() => {}} />);
}

/** The text a person reads, without tags and with entities turned back into characters. */
function text(markup: string): string {
  return markup
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

const SAMPLE: Record<WidgetKind, string[]> = {
  focus_time: ["11h 30m", "19 %", "vs last week", "14 sessions · 49 min on average"],
  focus_score: ["82", "of 100", "6 points", "23 blocked visits, 8 fewer than last week"],
  sessions: ["14", "2 more", "49 min", "10 of 14", "6 of 7"],
  weeks: ["Your best week of the last 8", "Average 8h 14m", "W39", "W46", "11h 30m"],
  best_hours: ["9 – 11 am", "Score 91 on average", "After 4 pm", "64"],
  best_of_week: ["95 min", "Sun · Thesis", "96", "Friday", "2h 30m", "Wednesday"],
  goals_reached: ["3 of 4", "reached", "Thesis", "4 of 4 sessions", "2.1 of 2 h", "2 short", "Reached", "W43", "1 of 4 reached"],
  goal_streaks: ["Run 10k", "Applications", "3 weeks in a row"],
  deadlines: ["Applications", "12 days", "18 days", "30 days", "No end date", "Mon, Nov 30"],
  plan: ["14 of 16 planned done", "Mon", "Sun", "Thesis , done", "Applications , not done", "2 of 3"],
  slipped: ["Applications session", "Wed 4pm · 45 min", "Fri 5:30pm · 45 min"],
  time_by_day: ["Thesis took 49 % of your time", "2h 30m", "Wednesday: 2h 30m (Thesis 1h 30m, No goal 35 min, Read more 25 min)"],
  top_areas: ["Thesis", "5h 40m", "50 min more", "No goal", "2h 15m", "Applications"],
  plan_kept: ["81 %", "of your planned time done", "4 points", "11h 30m done of 14h 10m planned"],
  busiest_day: ["Wednesday", "2h 30m in 3 events", "Saturday was the quietest, with nothing done."],
  time_on_goals: ["9h 15m", "of 11h 30m done", "80 % went to a goal, 2h 15m had none."],
  streak: ["9 days in a row", "5 more days to reach your record", "Record: 14 days"],
  heatmap: ["of 84 days with focus time", "Aug 24", "Nov 15", "Week of Nov 9: 11h 30m on 6 days"],
  weekdays: ["Wednesday is your strongest day", "47 sessions in 4 weeks", "Wednesday: 10"],
  blocked_visits: ["23", "8 fewer", "1.6 per session on average"],
  clean_sessions: ["6", "of 14", "sessions without a single blocked visit"],
  blocked_weeks: ["Your lowest in 8 weeks", "Down 5 weeks in a row", "Week 46: 23"],
  blocked_hours: ["Mostly after 4 pm", "10 of 23 blocked visits", "After 4 pm: 10"],
  top_sites: ["instagram.com", "9 visits", "x.com", "1 visit"],
  week_in_short: [sampleReport.summary, "Going well", "19 % more focus time than last week", "Needs attention", "Applications: 2 sessions short"],
};

const EMPTY: Record<WidgetKind, string> = {
  focus_time: "No focus sessions this week yet",
  focus_score: "No focus sessions this week yet",
  sessions: "No focus sessions this week yet",
  weeks: "No focus sessions in the last 8 weeks",
  best_hours: "No focus sessions in the last 8 weeks",
  best_of_week: "No focus sessions this week yet",
  goals_reached: "No goals with a weekly target yet",
  goal_streaks: "No goals with a weekly target yet",
  deadlines: "No goals with a weekly target yet",
  plan: "Nothing planned for a goal this week",
  slipped: "Nothing slipped this week",
  time_by_day: "Nothing marked done in your calendar this week yet",
  top_areas: "Nothing marked done in your calendar this week yet",
  plan_kept: "No planned time has ended this week yet",
  busiest_day: "Nothing marked done in your calendar this week yet",
  time_on_goals: "Nothing marked done in your calendar this week yet",
  streak: "Finish a focus session or mark a goal event done to start one",
  heatmap: "No focus time in the last 12 weeks",
  weekdays: "No focus sessions in the last 4 weeks",
  blocked_visits: "No blocked visits this week",
  clean_sessions: "No focus sessions this week yet",
  blocked_weeks: "No blocked visits in the last 8 weeks",
  blocked_hours: "No blocked visits this week",
  top_sites: "No blocked visits this week",
  week_in_short: emptyReport.summary,
};

describe("every widget", () => {
  it.each(WIDGET_KINDS)("%s shows the sample week's numbers", (kind) => {
    const shown = text(html(kind, sampleReport));
    for (const expected of SAMPLE[kind]) expect(shown).toContain(expected);
  });

  it.each(WIDGET_KINDS)("%s shows its empty text for a new account and no comparison", (kind) => {
    const shown = text(html(kind, emptyReport));
    expect(shown).toContain(EMPTY[kind]);
    expect(shown).not.toContain("vs last week");
  });

  it.each(WIDGET_KINDS)("%s never prints NaN, undefined or Infinity, in any size and in its details", (kind) => {
    const sizes: Size[] = [...WIDGETS[kind].sizes, "L"];
    for (const report of [sampleReport, emptyReport]) {
      for (const size of sizes) {
        const markup = html(kind, report, size, kind === "focus_time");
        expect(markup).not.toMatch(/NaN|undefined|Infinity|null/);
        if (size === WIDGETS[kind].sizes[0] && !(kind === "focus_time")) expect(markup).toMatch(/^<section/);
      }
    }
  });

  it.each(WIDGET_KINDS)("%s has a button that opens its details, named after the widget", (kind) => {
    const markup = html(kind, sampleReport);
    expect(text(markup.match(/<button[^>]*>.*?<\/button>/)?.[0] ?? "")).toContain(", open details");
    expect(text(markup)).toContain(kind === "streak" ? "Your streak" : WIDGETS[kind].title);
  });

  it("hides every chart from screen readers", () => {
    for (const kind of ["focus_time", "weeks", "time_by_day", "heatmap", "weekdays", "blocked_weeks", "blocked_hours"] as const) {
      expect(html(kind, sampleReport)).toMatch(/aria-hidden="true" class="flex min-h-16|aria-hidden="true" class="mt-3 flex min-h-0 flex-1/);
    }
  });
});

describe("the focus time card", () => {
  it("is the black hero card when asked, with the change in words", () => {
    const markup = html("focus_time", sampleReport, "M", true);
    expect(markup).toContain("bg-ink");
    expect(text(markup)).toContain("You were locked in for");
    expect(text(markup)).toContain("1h 50m more than last week");
  });

  it("is white with the bars a day otherwise", () => {
    const markup = html("focus_time", sampleReport, "M");
    expect(markup).not.toContain("You were locked in for");
    expect(markup).toContain("bg-surface");
  });
});

describe("goals", () => {
  it("a goal that is not met says how much is short, hours with their unit", () => {
    const report: AnalyticsReport = {
      ...sampleReport,
      goals: {
        ...sampleReport.goals,
        list: [
          ...sampleReport.goals.list.slice(0, 3),
          { ...sampleReport.goals.list[3], status: "open", rules: [{ unit: "hours", done: 0.5, target: 2, status: "open" }] },
        ],
      },
    };
    const shown = text(html("goals_reached", report));
    expect(shown).toContain("2 short");
    expect(shown).toContain("1.5 h short");
  });

  it("shows at most 4 goals and how many more", () => {
    const extra = [1, 2].map((n) => ({ ...sampleReport.goals.list[0], goal: { ...sampleReport.goals.list[0].goal, id: `x${n}`, title: `Extra ${n}` } }));
    const report: AnalyticsReport = { ...sampleReport, goals: { ...sampleReport.goals, list: [...sampleReport.goals.list, ...extra] } };
    const shown = text(html("goals_reached", report, "M"));
    expect(shown).toContain("+2 more");
    expect(shown).not.toContain("Extra 1");
  });

  it("writes deadlines as days, today or days ago", () => {
    const list = sampleReport.goals.list.map((row, i) => ({ ...row, daysLeft: [0, -3, 1, null][i] }));
    const shown = text(html("deadlines", { ...sampleReport, goals: { ...sampleReport.goals, list } }));
    for (const expected of ["Today", "3 days ago", "1 day", "No end date"]) expect(shown).toContain(expected);
  });
});

describe("changes against last week", () => {
  it("are green when good and grey when not", () => {
    const worse: AnalyticsReport = {
      ...sampleReport,
      blocked: { ...sampleReport.blocked, week: 40 },
      focus: { ...sampleReport.focus, week: { ...sampleReport.focus.week, sessions: 10 } },
    };
    expect(html("blocked_visits", sampleReport)).toContain("bg-success-soft");
    expect(text(html("blocked_visits", worse))).toContain("9 more");
    expect(html("blocked_visits", worse)).not.toContain("bg-success-soft");
    expect(text(html("sessions", worse))).toContain("2 fewer");
    expect(html("sessions", worse)).not.toContain("bg-success-soft");
  });
});
