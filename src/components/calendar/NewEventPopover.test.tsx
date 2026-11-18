// The small "New event" card and the undo toast as first rendered (spec 15), in the prototype's words.
// Rewritten for spec 16: the editor is drawn as its card (EditEventCard, NewEventCard); the bin is
// named "Delete event" and the goal chips are the prototype's pressed buttons.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DisplayProvider } from "@/components/shell/DisplayProvider";
import { DEFAULT_DISPLAY } from "@/lib/time/display";
import { ToastBar } from "./CalendarView";
import { EditEventCard, NewEventCard } from "./EventEditor";
import { NewEventForm } from "./NewEventPopover";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const H24 = { ...DEFAULT_DISPLAY, timeFormat: "24h" as const }; // these tests pin HH:MM, the 24-hour display (issue #161: the default display is 12h)
const GOALS = [{ id: "g1", title: "Run a half marathon", look: { color: "teal" as const, icon: "footprints" as const } }];

function card(startMin: number, endMin: number) {
  return renderToStaticMarkup(
    <DisplayProvider value={H24}>
      <NewEventForm date="2026-11-17" startMin={startMin} endMin={endMin} goals={GOALS} onClose={() => {}} onOpenEditor={() => {}} />
    </DisplayProvider>,
  );
}

describe("the New event card", () => {
  it("has the prototype's parts: eyebrow and day, the title field, goal chips, start and end, length chips, Add and Add details", () => {
    const html = card(540, 600);
    expect(html).toContain(">New event</p>");
    expect(html).toContain(">Tue, Nov 17</span>");
    expect(html).toMatch(/<input[^>]*aria-label="Title"[^>]*placeholder="What are you working on\?"/);
    expect(html).toMatch(/role="group" aria-label="Goal".*No goal.*Run a half marathon/s);
    expect(html).toMatch(/<input[^>]*aria-label="Start"[^>]*value="09:00"/);
    expect(html).toMatch(/<input[^>]*aria-label="End"[^>]*value="10:00"/);
    expect(html).toMatch(/role="group" aria-label="Duration".*>30m<.*>1h<.*>1\.5h<.*>2h</s);
    expect(html).toMatch(/<button type="submit"[^>]*disabled=""[^>]*>Add<\/button>/);
    expect(html).toMatch(/<button type="button"[^>]*disabled=""[^>]*>Add details<\/button>/);
  });

  it("keeps the Add / Add details row stuck to the bottom of the scrolling panel (issue #134)", () => {
    const html = card(540, 600);
    const row = html.match(/<div class="([^"]*)"><button type="submit"/);
    expect(row).not.toBeNull();
    expect(row![1]).toContain("sticky");
    expect(row![1]).toContain("bottom-0");
    expect(row![1]).toContain("bg-surface");
    expect(row![1]).toContain("border-t");
  });

  it("presses the chip of the dragged length and shows start and end as HH:MM (24-hour wheel)", () => {
    const html = card(540, 630);
    expect(html).toMatch(/aria-pressed="true"[^>]*>1\.5h</);
    expect(html).toMatch(/<input[^>]*aria-label="Start"[^>]*value="09:00"/);
    expect(html).toMatch(/<input[^>]*aria-label="End"[^>]*value="10:30"/);
    expect(html).toContain(" · 1h 30m");
  });

  it("is at least 15 minutes long, even after a tiny drag", () => {
    expect(card(600, 600)).toMatch(/<input[^>]*aria-label="End"[^>]*value="10:15"/);
  });
});

describe("the undo toast", () => {
  it("is a status line with Undo, as in the prototype", () => {
    const html = renderToStaticMarkup(<ToastBar toast={{ id: 1, text: "Moved to Thu, Nov 19, 2 – 3pm", undo: () => {} }} onDone={() => {}} />);
    expect(html).toMatch(/role="status"[^>]*><span[^>]*>Moved to Thu, Nov 19, 2 – 3pm<\/span><button type="button"[^>]*>Undo<\/button>/);
  });

  it("a refusal shows the server's message without Undo", () => {
    const html = renderToStaticMarkup(<ToastBar toast={{ id: 1, text: "Changed on another device. Reload to see the latest version" }} onDone={() => {}} />);
    expect(html).not.toContain("Undo");
  });
});

describe("deleting in the editor", () => {
  it("has the bin, and no 'Yes, delete' question any more: the toast offers Undo instead", () => {
    const event = {
      id: "e1",
      title: "Statistics revision",
      allDay: false as const,
      startAt: "2026-11-17T09:00:00.000Z",
      endAt: "2026-11-17T10:00:00.000Z",
      firstDay: null,
      lastDay: null,
      mayOverlap: false,
      status: "planned" as const,
      goalId: null,
      seriesId: null,
      source: "app" as const,
      location: null,
      notSent: false,
      updatedAt: "2026-11-15T10:00:00.000Z",
      conflict: false,
      startTime: "09:00",
      endTime: "10:00",
      endDay: null,
      startLocal: "2026-11-17T09:00",
      endLocal: "2026-11-17T10:00",
    };
    const html = renderToStaticMarkup(
      <DisplayProvider value={H24}>
        <EditEventCard event={event} anchor={null} goals={GOALS} timeZone="Europe/Lisbon" today="2026-11-16" onClose={() => {}} />
      </DisplayProvider>,
    );
    expect(html).toContain('aria-label="Delete event"');
    expect(html).not.toContain("Yes, delete");
  });

  it("'Add details' opens the editor with the card's title and goal", () => {
    const html = renderToStaticMarkup(
      <DisplayProvider value={H24}>
        <NewEventCard
          draft={{ start: "2026-11-17T09:00", end: "2026-11-17T10:30", title: "Read chapter 4", goalId: "g1" }}
          anchor={null}
          goals={GOALS}
          timeZone="Europe/Lisbon"
          today="2026-11-16"
          onClose={() => {}}
        />
      </DisplayProvider>,
    );
    expect(html).toMatch(/<input aria-label="Title"[^>]*value="Read chapter 4"/);
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*Run a half marathon/s);
  });

  it("shows the suggested day in a date field that can be changed (the day is a suggestion)", () => {
    const html = renderToStaticMarkup(
      <NewEventForm date="2026-11-17" today="2026-11-16" startMin={540} endMin={600} goals={GOALS} onClose={() => {}} onOpenEditor={() => {}} />,
    );
    expect(html).toMatch(/<button type="button" aria-expanded="false" aria-label="Date: Tue, Nov 17"/);
  });
});
