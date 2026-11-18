// The library's three articles on the Focus page (spec 29): there before and after a session,
// gone while one is running or paused.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FocusData, SessionDto } from "@/lib/focus/types";
import { teasersFor } from "@/lib/library/library";
import { FocusView } from "./FocusView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const NOW = "2026-11-16T09:15:00.000Z";
const library = teasersFor("2026-11-16");

const running: SessionDto = {
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
};

function render(data: Partial<FocusData>, teasers = library) {
  const blocker = { sites: [], connected: true, blockingOn: false, blockingUntil: null, timeZone: "Europe/Lisbon" };
  return renderToStaticMarkup(
    <FocusView data={{ active: null, recent: [], forEvent: null, forEventGoalId: null, goals: [], now: NOW, ...data }} blocker={blocker} library={teasers} />,
  );
}

describe("the library on the Focus page", () => {
  it("shows the day's three articles with their links, and the way to all of them", () => {
    const html = render({});
    expect(html).toContain("From the library");
    for (const teaser of library) {
      expect(html).toContain(`href="/focus/library/${teaser.slug}"`);
      expect(html).toContain(teaser.meta);
    }
    expect(html).toMatch(/<a href="\/focus\/library"[^>]*>All articles/);
    expect(html).toContain("Start focus");
  });

  it("is not there while a session is running", () => {
    const html = render({ active: running });
    expect(html).not.toContain("From the library");
    expect(html).not.toContain("/focus/library");
    expect(html).toContain("End session");
  });

  it("is not there while a session is paused", () => {
    const html = render({ active: { ...running, status: "paused", pausedAt: "2026-11-16T09:10:00.000Z" } });
    expect(html).not.toContain("From the library");
    expect(html).toContain("Resume");
  });

  it("is left out when the page gets no articles", () => {
    expect(render({}, [])).not.toContain("From the library");
  });
});
