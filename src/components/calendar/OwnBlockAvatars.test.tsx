// Spec 54, changed 19 Nov 2026 after the owner tried it with two accounts: the invited people's avatars
// on the owner's block never cover the time. With room for a row of their own under title and time they
// stay at the bottom left; with only the time line they lead the time row ("[JF] 12:00 – 13:00"); below
// 44 px there are none (the block's accessible name and title say who). One hour is 52 px.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { InvitePerson } from "@/lib/invites/types";

const RANGE = { startMin: 7 * 60, endMin: 21 * 60 };
const BEN: InvitePerson[] = [{ userId: "u1", name: "Ben Brown", photoUrl: null, answer: "accepted" }];

function ownEvent(startMin: number, endMin: number, extra: Record<string, unknown> = {}) {
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return {
    id: "e1", title: "Group project meeting", allDay: false as const, startAt: `2026-11-17T${hhmm(startMin)}:00.000Z`, endAt: `2026-11-17T${hhmm(endMin)}:00.000Z`,
    firstDay: null, lastDay: null, mayOverlap: false, status: "planned" as const, goalId: null, seriesId: null, source: "app" as const,
    location: null, notSent: false, updatedAt: "2026-11-15T10:00:00.000Z", conflict: false, startTime: hhmm(startMin), endTime: hhmm(endMin),
    endDay: null, startLocal: `2026-11-17T${hhmm(startMin)}`, endLocal: `2026-11-17T${hhmm(endMin)}`,
    ...extra,
  };
}

async function blockHtml(startMin: number, endMin: number, extra: Record<string, unknown> = {}) {
  const { TimeGrid } = await import("./TimeGrid");
  const own = ownEvent(startMin, endMin, extra);
  const day = { date: "2026-11-17", label: "Tue 17", isToday: false, events: [own], allDay: [] };
  const placed = [[{ event: own, startMin, endMin, continuesBefore: false, continuesAfter: false, lane: 0, lanes: 1 }]];
  const html = renderToStaticMarkup(
    <TimeGrid
      goals={[]}
      days={[day]}
      placed={placed}
      range={RANGE}
      nowMin={null}
      selectedDay="2026-11-17"
      onOpenEvent={() => {}}
      onCreate={() => {}}
      onDrop={() => {}}
      tripWarned={new Set()}
      timeZone="UTC"
      onOpenShared={() => {}}
      invitees={{ e1: BEN }}
    />,
  );
  const start = html.indexOf('data-event-id="e1"');
  return html.slice(start, html.indexOf("</button>", start));
}

describe("the invited people's avatars on the owner's block (spec 54, changed 19 Nov 2026)", () => {
  it("room for a row of their own (2 hours): bottom left, in their own row, after the time", async () => {
    const html = await blockHtml(600, 720);
    const stack = html.indexOf("data-avatar-stack");
    expect(stack).toBeGreaterThan(-1);
    expect(html.slice(0, stack)).toMatch(/<span aria-hidden="true" class="absolute bottom-1 left-1\.5 [^"]*"><span aria-hidden="true" $/);
    expect(html.indexOf("10am – 12pm")).toBeLessThan(stack);
  });

  it("only the time line (1 hour): the stack leads the time row, which is centred and still truncates", async () => {
    const html = await blockHtml(600, 660);
    const stack = html.indexOf("data-avatar-stack");
    expect(stack).toBeGreaterThan(-1);
    expect(html).not.toContain("absolute bottom-1 left-1.5");
    const row = html.match(/<span class="flex min-w-0 items-center gap-1 [^"]*">(.*)$/)?.[1] ?? "";
    expect(row).toContain("data-avatar-stack");
    expect(row).toMatch(/<span class="min-w-0 truncate tabular">10 – 11am<\/span>/);
    expect(row.indexOf("data-avatar-stack")).toBeLessThan(row.indexOf("10 – 11am"));
  });

  it("with a place a block needs 88 px for the own row: at 1.5 hours (78 px) the stack is in the time row", async () => {
    const html = await blockHtml(600, 690, { location: "Library" });
    expect(html).toContain("data-avatar-stack");
    expect(html).not.toContain("absolute bottom-1 left-1.5");
    expect(html).toMatch(/<span class="flex min-w-0 items-center gap-1 [^"]*"><span aria-hidden="true" class="shrink-0"><span aria-hidden="true" data-avatar-stack/);
  });

  it("below 44 px (30 minutes): no avatars and no time row; the name and title still say who", async () => {
    const html = await blockHtml(600, 630);
    expect(html).not.toContain("data-avatar-stack");
    expect(html).toContain("1 invited: Ben Brown accepted");
  });
});
