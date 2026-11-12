// The event editor's markup as first rendered (spec 07): the "All day" switch, the repeat controls
// when creating, what an all-day event and an event of a series show, and the series question.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AllDayEvent, WeekEvent } from "@/lib/events/types";
import { EventEditor, SeriesQuestion, type EditorState } from "./EventEditor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const TIMED: WeekEvent = {
  id: "e1",
  title: "Statistics lecture",
  allDay: false,
  startAt: "2026-11-17T09:00:00.000Z",
  endAt: "2026-11-17T10:00:00.000Z",
  firstDay: null,
  lastDay: null,
  mayOverlap: false,
  status: "planned",
  goalId: null,
  seriesId: null, source: "app", location: null, notSent: false,
  updatedAt: "2026-11-15T10:00:00.000Z",
  conflict: false,
  startTime: "09:00",
  endTime: "10:00",
  endDay: null,
  startLocal: "2026-11-17T09:00",
  endLocal: "2026-11-17T10:00",
};

const EXAM: AllDayEvent = {
  id: "x1",
  title: "Exam week",
  allDay: true,
  firstDay: "2026-11-16",
  lastDay: "2026-11-20",
  mayOverlap: false,
  status: "planned",
  goalId: null,
  seriesId: null, source: "app", location: null, notSent: false,
  updatedAt: "2026-11-15T10:00:00.000Z",
};

const render = (state: EditorState) =>
  renderToStaticMarkup(<EventEditor state={state} goals={[{ id: "g1", title: "Run a half marathon", colorIndex: 0 }]} onClose={() => {}} />);

describe("event editor markup", () => {
  it("a new event has an 'All day' switch and a Repeat choice: none, daily, weekly, monthly", () => {
    const html = render({ mode: "create", start: "2026-11-17T09:00", end: "2026-11-17T10:00" });
    expect(html).toMatch(/<label[^>]*>All day<input[^>]*type="checkbox" role="switch"/);
    expect(html).toContain('<label for="new-repeat"');
    for (const option of ["Does not repeat", "Every day", "Every week", "Every month"]) expect(html).toContain(`>${option}</option>`);
  });

  it("an existing timed event offers no Repeat (a series is never extended), but keeps Mark done and Start focus", () => {
    const html = render({ mode: "edit", event: TIMED });
    expect(html).not.toContain("Does not repeat");
    expect(html).toContain("Mark done");
    expect(html).toContain("Start focus");
    expect(html).toContain('role="switch"');
  });

  it("an all-day event shows its first and last day, and no times, goal, Mark done or Start focus", () => {
    const html = render({ mode: "edit", event: EXAM });
    expect(html).toMatch(/<input[^>]*role="switch"[^>]*checked=""|<input[^>]*checked=""[^>]*role="switch"/);
    expect(html).toMatch(/>First day<\/label><input[^>]*name="firstDay"[^>]*value="2026-11-16"/);
    expect(html).toMatch(/>Last day<\/label><input[^>]*name="lastDay"[^>]*value="2026-11-20"/);
    for (const absent of ['name="start"', 'name="goal"', "Mark done", "Start focus", "May overlap"]) expect(html).not.toContain(absent);
  });

  it("an event of a series is marked 'Repeating' and has no 'All day' switch", () => {
    const html = render({ mode: "edit", event: { ...TIMED, seriesId: "s1" } });
    expect(html).toContain(">Repeating</span>");
    expect(html).not.toContain('role="switch"');
  });

  it("asks 'This event' or 'This and following events' before saving or deleting an event of a series", () => {
    const save = renderToStaticMarkup(<SeriesQuestion kind="save" title="Statistics lecture" busy={false} onAnswer={() => {}} onCancel={() => {}} />);
    expect(save).toContain("Save changes to &#x27;Statistics lecture&#x27;?");
    const remove = renderToStaticMarkup(<SeriesQuestion kind="delete" title="Statistics lecture" busy={false} onAnswer={() => {}} onCancel={() => {}} />);
    expect(remove).toContain("Delete &#x27;Statistics lecture&#x27;?");
    for (const html of [save, remove]) {
      expect(html).toMatch(/<button[^>]*>This event<\/button><button[^>]*>This and following events<\/button><button[^>]*>Cancel<\/button>/);
    }
  });

  it("an Outlook event shows title and times as text, its goal and Mark done, and 'Change this event in Outlook'", () => {
    const html = render({ mode: "edit", event: { ...TIMED, source: "outlook", location: "Nova SBE, Carcavelos" } });
    expect(html).toContain(">Statistics lecture</p>");
    expect(html).toContain(">Tuesday 17 November, 09:00 to 10:00</p>");
    expect(html).toContain(">Nova SBE, Carcavelos</p>");
    expect(html).toContain(">Change this event in Outlook</p>");
    expect(html).toContain("From Outlook</span>");
    expect(html).toContain('name="goal"');
    expect(html).toContain("Mark done");
    for (const absent of ['name="title"', 'name="start"', 'role="switch"', "May overlap", "Delete Statistics lecture"]) expect(html).not.toContain(absent);
  });

  it("an all-day Outlook event has nothing to save", () => {
    const html = render({ mode: "edit", event: { ...EXAM, source: "outlook" } });
    expect(html).toContain(">Monday 16 November to Friday 20 November, all day</p>");
    expect(html).not.toMatch(/type="submit"/);
  });

  it("an app event that Outlook does not have yet says so", () => {
    expect(render({ mode: "edit", event: { ...TIMED, notSent: true } })).toContain("Not sent to Outlook</span>");
  });
});
