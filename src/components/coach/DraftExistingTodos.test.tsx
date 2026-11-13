// Spec 23 on the coach's screen: an event already in the calendar that the draft adds to-dos to is drawn
// as the calendar's own with a small mark "+2 to-dos" (an all-day one among the all-day chips), its day
// shown also when the draft has nothing else on it, and under the column "To-dos for 'Lernblock'" with
// the new titles. It is never draggable. The button reads "Apply changes".
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DisplayProvider } from "@/components/shell/DisplayProvider";
import type { DraftDto, DraftTodosDto } from "@/lib/chat/types";
import { DEFAULT_DISPLAY } from "@/lib/time/display";
import { DraftCard } from "./DraftCard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const LERNBLOCK: DraftTodosDto = {
  eventId: "ev-1",
  title: "Lernblock",
  allDay: false,
  startAt: "2026-11-17T14:00:00.000Z",
  endAt: "2026-11-17T16:00:00.000Z",
  firstDay: null,
  lastDay: null,
  todos: ["Do the investment exercises", "Watch the investment lecture"],
};

const EXAM: DraftTodosDto = {
  eventId: "ev-2",
  title: "Exam week",
  allDay: true,
  startAt: null,
  endAt: null,
  firstDay: "2026-11-18",
  lastDay: "2026-11-20",
  todos: ["Revise"],
};

const draft = (more: Partial<DraftDto> = {}): DraftDto => ({ id: "d1", status: "open", events: [], changes: [], addedTodos: [LERNBLOCK], ...more });

const render = (d: DraftDto) =>
  renderToStaticMarkup(
    <DisplayProvider value={DEFAULT_DISPLAY}>
      <DraftCard draft={d} goals={[]} timeZone="Europe/Lisbon" calendar={[]} onStatus={() => {}} />
    </DisplayProvider>,
  );

describe("a draft that adds to-dos to an event in the calendar", () => {
  it("shows the event's day with the event, the mark and the list, and 'Apply changes'", () => {
    const html = render(draft());
    expect(html).toContain("Draft for Tue, Nov 17");
    expect(html).toContain('data-sketch="todos"');
    expect(html).toContain("+2 to-dos");
    expect(html).toContain("To-dos for &#x27;Lernblock&#x27;");
    expect(html.indexOf(">Do the investment exercises<")).toBeLessThan(html.indexOf(">Watch the investment lecture<"));
    expect(html).toContain("Lernblock, 2pm to 4pm, already in the calendar, 2 to-dos added");
    expect(html).toContain("Apply changes");
    expect(html).not.toContain("Add to calendar");
    // Never draggable.
    expect(html).not.toContain("data-draggable");
    expect(html).not.toContain("Drag a block");
  });

  it("an all-day event is shown with the all-day chips, also on a draft that is not open", () => {
    for (const status of ["open", "accepted"] as const) {
      const html = render(draft({ status, addedTodos: [EXAM] }));
      expect(html).toContain("Draft for Wed, Nov 18");
      expect(html).toContain('aria-label="All day"');
      expect(html).toContain("+1 to-do");
      expect(html).toContain("To-dos for &#x27;Exam week&#x27;");
      expect(html).toContain("Exam week, all day, already in the calendar, 1 to-do added");
    }
  });

  it("after applying the card offers undo as for the other kinds", () => {
    const html = render(draft({ status: "accepted" }));
    expect(html).toContain("Undo");
    expect(html).toContain("Open calendar");
    expect(html).toContain("+2 to-dos");
  });

  it("a draft without them shows none of it", () => {
    const html = render(
      draft({ addedTodos: undefined, events: [{ title: "Call", startAt: "2026-11-17T15:00:00.000Z", endAt: "2026-11-17T15:30:00.000Z", goalId: null }] }),
    );
    expect(html).not.toContain("To-dos for");
    expect(html).not.toContain('data-sketch="todos"');
    expect(html).toContain("Add to calendar");
  });
});
