// The Focus page's markup in each state (spec 04): start, running, paused, rating, recent sessions.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FocusData, SessionDto } from "@/lib/focus/types";
import { afterRejection, FocusView } from "./FocusView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const NOW = "2026-11-16T09:15:00.000Z";

function session(fields: Partial<SessionDto>): SessionDto {
  return {
    id: "s1",
    eventId: null,
    eventTitle: null,
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

function render(data: Partial<FocusData>) {
  return renderToStaticMarkup(<FocusView data={{ active: null, recent: [], forEvent: null, now: NOW, ...data }} />);
}

describe("Focus page", () => {
  it("offers the five lengths as a radio group with 60 minutes chosen, and Start focus", () => {
    const html = render({});
    for (const label of ["15 min", "30 min", "1 h", "1 h 30 min", "2 h"]) expect(html).toContain(label);
    expect(html).toMatch(/<input[^>]*checked=""[^>]*value="60"|<input[^>]*value="60"[^>]*checked=""/);
    expect(html).toContain("Start focus");
    expect(html).toContain("No finished sessions yet.");
  });

  it("preselects the suggested length when opened for an event and names the event", () => {
    const html = render({ forEvent: { id: "e1", title: "Statistics revision", suggestedMinutes: 120 } });
    expect(html).toContain("Statistics revision");
    expect(html).toMatch(/<input[^>]*checked=""[^>]*value="120"|<input[^>]*value="120"[^>]*checked=""/);
  });

  it("shows a running session with the time left as a timer and Pause, End session, Cancel", () => {
    const html = render({ active: session({ eventTitle: "Statistics revision" }) });
    expect(html).toContain('role="timer" aria-label="45:00 left"');
    expect(html).toContain("Statistics revision");
    for (const label of [">Pause<", ">End session<", ">Cancel<"]) expect(html).toMatch(new RegExp(label.replace(/[<>]/g, "[^<]*")));
    expect(html).not.toContain("Start focus");
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
  });

  it("reloads after 'This session has already ended' or 'Not found', and keeps the page for other rejections", () => {
    const answer = (status: number, error: string, message: string) => ({ ok: false, status, message, data: { error, message } });
    expect(afterRejection(answer(409, "session_ended", "This session has already ended"))).toEqual({ reload: true });
    expect(afterRejection(answer(404, "not_found", "Not found"))).toEqual({ reload: true });
    expect(afterRejection(answer(409, "not_possible", "Not possible in this state"))).toEqual({ reload: false });
    expect(afterRejection(answer(400, "rating_range", "Rating must be a whole number from 0 to 5"))).toEqual({ reload: false });
    expect(afterRejection({ ok: false, status: 0, message: "We could not reach the server." })).toEqual({ reload: false });
  });
});
