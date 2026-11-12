import { describe, expect, it } from "vitest";
import { attemptsDuring, averageScore, scoreText, sessionScore, weekAnalytics, type Attempt, type FinishedSession } from "./score";

const at = (iso: string) => new Date(iso);

function session(start: string, end: string, planned: number, focused: number): FinishedSession {
  return { startedAt: at(start), endedAt: at(end), plannedMinutes: planned, focusedMinutes: focused };
}

const attempt = (domain: string, time: string): Attempt => ({ domain, attemptedAt: at(time) });

describe("the focus score of one session (R19)", () => {
  it("A2: 60 planned, 45 focused, 2 attempts: 75 − 10 = 65", () => {
    expect(sessionScore({ plannedMinutes: 60, focusedMinutes: 45 }, 2)).toBe(65);
  });

  it("rounds 100 × focused ÷ planned (29 of 90 is 32.2, 31 of 90 is 34.4, 1 of 120 is 0.8)", () => {
    expect(sessionScore({ plannedMinutes: 90, focusedMinutes: 29 }, 0)).toBe(32);
    expect(sessionScore({ plannedMinutes: 90, focusedMinutes: 31 }, 0)).toBe(34);
    expect(sessionScore({ plannedMinutes: 120, focusedMinutes: 1 }, 0)).toBe(1);
  });

  it("ending early lowers it (30 of 60 is 50), and it stays between 0 and 100", () => {
    expect(sessionScore({ plannedMinutes: 60, focusedMinutes: 30 }, 0)).toBe(50);
    expect(sessionScore({ plannedMinutes: 60, focusedMinutes: 60 }, 25)).toBe(0);
    expect(sessionScore({ plannedMinutes: 60, focusedMinutes: 60 }, 0)).toBe(100);
  });
});

describe("attempts during a session", () => {
  const s = session("2026-11-16T09:00:00Z", "2026-11-16T09:55:00Z", 60, 45);
  it("counts attempts from the start to the end, both included, and none outside", () => {
    const list = [
      attempt("x.com", "2026-11-16T08:59:59Z"),
      attempt("x.com", "2026-11-16T09:00:00Z"),
      attempt("x.com", "2026-11-16T09:30:00Z"),
      attempt("x.com", "2026-11-16T09:55:00Z"),
      attempt("x.com", "2026-11-16T09:55:01Z"),
    ];
    expect(attemptsDuring(s, list)).toBe(3);
  });
});

describe("the average of a day or week (R19)", () => {
  it("is the rounded mean, and null (shown '–', not 0) without sessions", () => {
    expect(averageScore([65, 100, 50])).toBe(72);
    expect(averageScore([])).toBeNull();
    expect(scoreText(null)).toBe("–");
    expect(scoreText(0)).toBe("0");
  });
});

describe("a week's analytics (R20)", () => {
  const sessions = [
    // A2 on Monday: 09:00–09:55, 45 focused, with 2 attempts inside.
    session("2026-11-16T09:00:00Z", "2026-11-16T09:55:00Z", 60, 45),
    // Tuesday: a full 30-minute session.
    session("2026-11-17T14:00:00Z", "2026-11-17T14:30:00Z", 30, 30),
  ];
  const attempts = [
    attempt("instagram.com", "2026-11-16T09:15:00Z"),
    attempt("youtube.com", "2026-11-16T09:40:00Z"),
    // During an auto-block event on Wednesday, outside any session: counts for the day, not a score.
    attempt("instagram.com", "2026-11-18T10:15:00Z"),
    // Previous week: not in this week's numbers.
    attempt("reddit.com", "2026-11-15T22:00:00Z"),
  ];
  const week = weekAnalytics(sessions, attempts, "2026-11-16", "Europe/Lisbon");

  it("gives each day its focused minutes, sessions, score and attempts", () => {
    expect(week.days.slice(0, 3)).toEqual([
      { date: "2026-11-16", focusedMinutes: 45, sessions: 1, score: 65, attempts: 2 },
      { date: "2026-11-17", focusedMinutes: 30, sessions: 1, score: 100, attempts: 0 },
      { date: "2026-11-18", focusedMinutes: 0, sessions: 0, score: null, attempts: 1 },
    ]);
  });

  it("gives the week the totals and the average of all its sessions", () => {
    expect(week.week).toEqual({ focusedMinutes: 75, sessions: 2, score: 83, attempts: 3 });
  });

  it("ranks the most blocked sites of the week", () => {
    expect(week.topSites).toEqual([
      { domain: "instagram.com", count: 2 },
      { domain: "youtube.com", count: 1 },
    ]);
  });

  it("puts a session and an attempt on their day in the user's time zone", () => {
    // Monday 16 November 03:00 UTC is still Sunday 15 November in New York: the week before.
    const ny = weekAnalytics(
      [session("2026-11-16T03:00:00Z", "2026-11-16T03:30:00Z", 30, 30)],
      [attempt("x.com", "2026-11-16T03:10:00Z")],
      "2026-11-16",
      "America/New_York",
    );
    expect(ny.week).toEqual({ focusedMinutes: 0, sessions: 0, score: null, attempts: 0 });
  });

  it("shows '–' for an empty week, not 0", () => {
    const empty = weekAnalytics([], [], "2026-11-16", "Europe/Lisbon");
    expect(empty.week.score).toBeNull();
    expect(empty.topSites).toEqual([]);
  });

  it("keeps at most five sites", () => {
    const many = ["a.com", "b.com", "c.com", "d.com", "e.com", "f.com"].map((d) => attempt(d, "2026-11-17T10:00:00Z"));
    expect(weekAnalytics([], many, "2026-11-16", "Europe/Lisbon").topSites).toHaveLength(5);
  });
});
