// Spec 21 on the coach's screen: a proposal with to-dos shows their count on its block when the block
// is tall enough, and their titles in a list under the day; the screen-reader list says how many.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DisplayProvider } from "@/components/shell/DisplayProvider";
import { sketchDraft } from "@/lib/chat/day-sketch";
import type { DraftDto } from "@/lib/chat/types";
import { DEFAULT_DISPLAY } from "@/lib/time/display";
import { DraftCard } from "./DraftCard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const DRAFT: DraftDto = {
  id: "d1",
  status: "open",
  events: [
    { title: "Study", startAt: "2026-11-17T12:00:00.000Z", endAt: "2026-11-17T14:00:00.000Z", goalId: null, todos: ["Read chapter 3", "Exercises 1-4", "Summary"] },
    { title: "Call", startAt: "2026-11-17T15:00:00.000Z", endAt: "2026-11-17T15:30:00.000Z", goalId: null },
  ],
  changes: [],
};

const render = (draft: DraftDto) =>
  renderToStaticMarkup(
    <DisplayProvider value={DEFAULT_DISPLAY}>
      <DraftCard draft={draft} goals={[]} timeZone="Europe/Lisbon" calendar={[]} onStatus={() => {}} />
    </DisplayProvider>,
  );

describe("a draft's to-dos", () => {
  it("the sketch keeps a proposal's to-dos; a proposal without has none", () => {
    const [day] = sketchDraft(DRAFT.events, [], "Europe/Lisbon");
    expect(day.proposals.map((p) => p.todos)).toEqual([["Read chapter 3", "Exercises 1-4", "Summary"], undefined]);
  });

  it("shows the count on the block and the titles in a list under the day, in order", () => {
    const html = render(DRAFT);
    expect(html).toMatch(/tabular opacity-80">0\/3<\/span>/);
    expect(html).toContain('aria-label="To-dos"');
    expect(html.indexOf(">Read chapter 3<")).toBeGreaterThan(0);
    expect(html.indexOf(">Read chapter 3<")).toBeLessThan(html.indexOf(">Exercises 1-4<"));
    expect(html.indexOf(">Exercises 1-4<")).toBeLessThan(html.indexOf(">Summary<"));
    expect(html).toContain("Study, 12pm to 2pm, 3 to-dos");
  });

  it("a draft without to-dos shows no list", () => {
    const html = render({ ...DRAFT, events: [DRAFT.events[1]] });
    expect(html).not.toContain('aria-label="To-dos"');
    expect(html).not.toContain("to-dos");
  });
});
