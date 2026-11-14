// The Focus page's markup in each state (spec 04): start, running, paused, rating, recent sessions.
// Rewritten for the prototype-style branch (spec 12): the blocker card moved to Settings; the page keeps
// the prototype's small status chip that links there, and recent sessions show month-first dates.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FocusData, SessionDto } from "@/lib/focus/types";
import { afterRejection, FocusView } from "./FocusView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const NOW = "2026-11-16T09:15:00.000Z";

function session(fields: Partial<SessionDto>): SessionDto {
  return {
    id: "s1",
    eventId: null,
    eventTitle: null,
    eventGoalId: null,
    plannedMinutes: 60,
    status: "running",
    startedAt: "2026-11-16T09:00:00.000Z",
    pausedAt: null,
    pausedSeconds: 0,
    endedAt: null,
    rating: null,
    ...fields,
  };
}

/** The column of the custom length wheel with this label, as rendered markup. */
function column(html: string, label: string): string {
  const start = html.indexOf(`role="listbox" tabindex="0" aria-label="${label}"`);
  expect(start).toBeGreaterThan(-1);
  // The column ends where its last row and the column itself close.
  return html.slice(start, html.indexOf("</div></div>", start) + "</div>".length);
}
/** The rows of a wheel column, in order. */
const rowsOf = (html: string, label: string) => [...column(html, label).matchAll(/role="option"[^>]*>([^<]*)</g)].map((m) => m[1]);
/** The row a wheel column stands on. */
const chosenOn = (html: string, label: string) => /aria-selected="true"[^>]*>([^<]*)</.exec(column(html, label))?.[1];

function render(data: Partial<FocusData>) {
  // The blocker card lives in Settings (its own test); here only the chip that links there.
  const blocker = { sites: [], connected: true, blockingOn: false, blockingUntil: null, timeZone: "Europe/Lisbon" };
  return renderToStaticMarkup(<FocusView data={{ active: null, recent: [], forEvent: null, forEventGoalId: null, goals: [], now: NOW, ...data }} blocker={blocker} />);
}

describe("Focus page", () => {
  it("offers the five suggested lengths and Custom as a radio group with 60 minutes chosen, and Start focus (R12)", () => {
    const html = render({});
    for (const label of ["15 min", "30 min", "1 h", "1 h 30 min", "2 h", "Custom"]) expect(html).toContain(label);
    expect(html).not.toContain('aria-label="Custom length"');
    expect(html).toMatch(/<input[^>]*checked=""[^>]*value="60"|<input[^>]*value="60"[^>]*checked=""/);
    expect(html).toContain("Start focus");
    expect(html).toContain("No finished sessions yet.");
  });

  it("preselects the suggested length when opened for an event and names the event", () => {
    const html = render({ forEvent: { id: "e1", title: "Statistics revision", suggestedMinutes: 120 } });
    expect(html).toContain("Statistics revision");
    expect(html).toMatch(/<input[^>]*checked=""[^>]*value="120"|<input[^>]*value="120"[^>]*checked=""/);
  });

  it("opens Custom with the event's length on a wheel of hours and minutes when it is not a suggestion (R12)", () => {
    const html = render({ forEvent: { id: "e1", title: "Short call", suggestedMinutes: 45 } });
    expect(html).toMatch(/<input[^>]*checked=""[^>]*value="custom"|<input[^>]*value="custom"[^>]*checked=""/);
    expect(html).toContain('aria-label="Custom length"');
    expect([chosenOn(html, "Hours"), chosenOn(html, "Minutes")]).toEqual(["0", "45"]);
    expect(html).toContain(">hours<");
    expect(html).toContain(">min<");
    expect(html).not.toContain('type="number"');
  });

  it("shows a custom length over an hour as hours and minutes on the wheel, up to 23 h 59 min (R12)", () => {
    const long = render({ forEvent: { id: "e1", title: "Long read", suggestedMinutes: 70 } });
    expect([chosenOn(long, "Hours"), chosenOn(long, "Minutes")]).toEqual(["1", "10"]);
    const day = render({ forEvent: { id: "e1", title: "Hackathon", suggestedMinutes: 1439 } });
    expect([chosenOn(day, "Hours"), chosenOn(day, "Minutes")]).toEqual(["23", "59"]);
    // The hours go from 0 to 23 and the minutes from 0 to 59, nothing beyond.
    expect(rowsOf(day, "Hours")).toEqual(Array.from({ length: 24 }, (_, h) => String(h)));
    expect(rowsOf(day, "Minutes")).toEqual(Array.from({ length: 60 }, (_, m) => String(m)));
    expect(day).not.toContain("Choose a length");
  });

  it("shows a running session with the time left as a timer and Pause, End session, Cancel", () => {
    const html = render({ active: session({ eventTitle: "Statistics revision" }) });
    expect(html).toContain('role="timer" aria-label="45:00 left"');
    expect(html).toContain("Statistics revision");
    for (const label of [">Pause<", ">End session<", ">Cancel<"]) expect(html).toMatch(new RegExp(label.replace(/[<>]/g, "[^<]*")));
    expect(html).not.toContain("Start focus");
  });

  it("shows the session's goal as in the prototype: tile and name above the title, its icon in the ring, the ring in its colour (spec 13)", () => {
    const goals = [{ id: "g1", title: "Run a half marathon", look: { color: "teal" as const, icon: "footprints" as const } }];
    const html = render({ goals, active: session({ eventId: "e1", eventTitle: "Easy run", eventGoalId: "g1" }) });
    expect(html).toMatch(/lucide-footprints[\s\S]*Run a half marathon[\s\S]*Easy run/);
    expect(html).toContain("stroke-teal-500");
    expect(html).toMatch(/lucide-footprints[^"]*text-teal-600/);

    const noGoal = render({ goals, active: session({ eventId: "e2", eventTitle: "Dentist" }) });
    expect(noGoal).toContain("No goal");
    expect(noGoal).not.toContain("stroke-teal-500");

    const start = render({ goals, forEvent: { id: "e1", title: "Easy run", suggestedMinutes: 60 }, forEventGoalId: "g1" });
    expect(start).toMatch(/lucide-footprints[\s\S]*Run a half marathon[\s\S]*Easy run/);
  });

  it("shows a paused session as paused, with Resume and the time left frozen", () => {
    const html = render({ active: session({ status: "paused", pausedAt: "2026-11-16T09:05:00.000Z" }) });
    expect(html).toContain('aria-label="55:00 left"');
    expect(html).toContain(">Paused<");
    expect(html).toMatch(/Resume/);
  });

  it("asks for a rating 0 to 5 after a session ended, and lists recent sessions with their rating in words", () => {
    const html = render({
      recent: [
        { ...session({ status: "finished", endedAt: "2026-11-16T09:10:00.000Z" }), focusedMinutes: 10 },
        { ...session({ id: "s0", status: "finished", startedAt: "2026-11-13T09:00:00.000Z", endedAt: "2026-11-13T09:55:00.000Z", rating: 0 }), focusedMinutes: 45 },
      ],
    });
    expect(html).toContain("How did it go?");
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(6);
    expect(html).toContain("Not rated");
    expect(html).toContain("Rated 0 of 5");
    expect(html).toContain(">Fri, Nov 13</span>");
  });

  it("shows the blocker as a small chip that links to the blocker settings, not the whole card", () => {
    const html = render({});
    expect(html).toMatch(/<a href="\/settings#blocker"[^>]*>.*0 sites on your block list.*<\/a>/);
    expect(html).not.toContain("Blocked sites");
    expect(html).not.toContain('name="domain"');
  });

  it("reloads after 'This session has already ended' or 'Not found', and keeps the page for other rejections", () => {
    const answer = (status: number, error: string, message: string) => ({ ok: false, status, message, data: { error, message } });
    expect(afterRejection(answer(409, "session_ended", "This session has already ended"))).toEqual({ reload: true });
    expect(afterRejection(answer(404, "not_found", "Not found"))).toEqual({ reload: true });
    // Another tab already started, paused or ended the session: the page must show the real state.
    expect(afterRejection(answer(409, "not_possible", "Not possible in this state"))).toEqual({ reload: true });
    expect(afterRejection(answer(409, "session_running", "A session is already running"))).toEqual({ reload: true });
    expect(afterRejection(answer(400, "rating_range", "Rating must be a whole number from 0 to 5"))).toEqual({ reload: false });
    expect(afterRejection({ ok: false, status: 0, message: "We could not reach the server." })).toEqual({ reload: false });
  });

  it("keeps Start focus off and shows the rule when the wheel stands on 0 hours 0 min (R12, A10)", () => {
    const zero = render({ forEvent: { id: "e1", title: "Nothing", suggestedMinutes: 0 } });
    expect([chosenOn(zero, "Hours"), chosenOn(zero, "Minutes")]).toEqual(["0", "0"]);
    expect(zero).toContain("Choose a length from 1 minute to 23 h 59 min");
    expect(zero).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Start focus/);
    const fine = render({ forEvent: { id: "e1", title: "Short call", suggestedMinutes: 45 } });
    expect(fine).not.toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Start focus/);
  });
});
