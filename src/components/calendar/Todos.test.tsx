// To-dos inside an event on screen (spec 21), as the browser first receives the markup: the list in the
// prototype's look (heading with "2/3", grip, box, title, cross, "Add a to-do"), its place in the editor
// right under WHEN (not for Outlook events), the new event's editor holding a list, and the count on a
// block that is tall enough. Also what the calendar sends to bring a deleted event back with its to-dos.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DisplayProvider } from "@/components/shell/DisplayProvider";
import type { PostResult } from "@/lib/client/post-json";
import type { WeekData, WeekEvent } from "@/lib/events/types";
import { DEFAULT_DISPLAY } from "@/lib/time/display";
import { Announcer } from "./Announcer";
import { CalendarView } from "./CalendarView";
import { createBody, newValues } from "./editor/values";
import { TodoList } from "./editor/TodoList";
import { deletedTodos, recreateBody } from "./event-changes";
import { EditEventCard, NewEventCard } from "./EventEditor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const noop = () => {};

function event(id: string, title: string, start: string, end: string, fields: Partial<WeekEvent> = {}): WeekEvent {
  return {
    id,
    title,
    startAt: "2026-11-17T12:00:00.000Z",
    endAt: "2026-11-17T13:00:00.000Z",
    mayOverlap: false,
    status: "planned",
    allDay: false,
    firstDay: null,
    lastDay: null,
    seriesId: null,
    source: "app",
    location: null,
    notSent: false,
    goalId: null,
    updatedAt: "2026-11-15T10:00:00.000Z",
    conflict: false,
    startTime: start.slice(11),
    endTime: end.slice(11),
    endDay: null,
    startLocal: start,
    endLocal: end,
    ...fields,
  };
}

const COMMON = { goals: [], timeZone: "Europe/Lisbon", today: "2026-11-16", anchor: null, onClose: noop };

describe("the list, as in the prototype", () => {
  const html = renderToStaticMarkup(
    <TodoList
      todos={[
        { key: "a", title: "Read chapter 3", done: true },
        { key: "b", title: "Exercises 1-4", done: false },
        { key: "c", title: "Summary", done: false },
      ]}
      onAdd={noop}
      onRename={noop}
      onToggle={noop}
      onMove={noop}
      onDelete={noop}
    />,
  );

  it("shows the heading with the count, '1/3', also in words", () => {
    expect(html).toContain(">To-dos</p>");
    expect(html).toContain('aria-label="1 of 3 done">1/3</span>');
  });

  it("each row: a grip to reorder, a real box to tick, the title (struck through when done), a cross to delete", () => {
    expect(html).toContain('aria-label="Reorder &quot;Exercises 1-4&quot;"');
    expect(html).toContain('aria-label="Mark &quot;Read chapter 3&quot; not done"');
    expect(html).toContain('aria-label="Mark &quot;Exercises 1-4&quot; done"');
    expect(html).toContain('aria-label="Delete &quot;Summary&quot;"');
    expect(html).toMatch(/line-through[^>]*>Read chapter 3</);
    expect(html).not.toMatch(/line-through[^>]*>Exercises 1-4</);
    // In order.
    expect(html.indexOf("Read chapter 3")).toBeLessThan(html.indexOf("Exercises 1-4"));
    expect(html.indexOf("Exercises 1-4")).toBeLessThan(html.indexOf("Summary"));
  });

  it("ends with the field 'Add a to-do', at most 100 characters", () => {
    expect(html).toMatch(/<input[^>]*placeholder="Add a to-do"[^>]*aria-label="Add a to-do"[^>]*maxLength="100"/);
  });

  it("an empty list shows the heading without a count, and the field", () => {
    const empty = renderToStaticMarkup(<TodoList todos={[]} onAdd={noop} onRename={noop} onToggle={noop} onMove={noop} onDelete={noop} />);
    expect(empty).toContain(">To-dos</p>");
    expect(empty).not.toContain("/0");
    expect(empty).toContain('placeholder="Add a to-do"');
  });

  it("shows a refusal under the list", () => {
    const refused = renderToStaticMarkup(
      <TodoList todos={[]} error="An event can have at most 20 to-dos" onAdd={noop} onRename={noop} onToggle={noop} onMove={noop} onDelete={noop} />,
    );
    expect(refused).toContain('role="alert"');
    expect(refused).toContain("An event can have at most 20 to-dos");
  });
});

describe("its place in the editor", () => {
  const order = (html: string) => [...html.matchAll(/uppercase[^>]*>([^<]+)</g)].map((m) => m[1]);

  // Rewritten for spec 24: GUESTS now sits between WHEN and TO-DOS, so it is seen without scrolling.
  it("an app event: TO-DOS under WHEN and GUESTS, before GOAL", () => {
    const html = renderToStaticMarkup(<EditEventCard event={event("e1", "Study", "2026-11-17T12:00", "2026-11-17T13:00")} {...COMMON} />);
    expect(order(html).slice(0, 4)).toEqual(["When", "Guests", "To-dos", "Goal"]);
  });

  it("an Outlook event has no to-dos (R11)", () => {
    const html = renderToStaticMarkup(
      <EditEventCard event={event("e2", "Team call", "2026-11-17T10:00", "2026-11-17T11:00", { source: "outlook" })} {...COMMON} />,
    );
    expect(html).not.toContain("To-dos");
    expect(html).not.toContain("Add a to-do");
  });

  it("a new event ('Add details') holds a list too", () => {
    const html = renderToStaticMarkup(<NewEventCard draft={{ start: "2026-11-17T12:00", end: "2026-11-17T13:00" }} {...COMMON} />);
    expect(order(html).slice(0, 4)).toEqual(["When", "Guests", "To-dos", "Goal"]);
  });
});

describe("the count on the block", () => {
  function render(events: WeekEvent[]) {
    const data: WeekData = {
      timeZone: "Europe/Lisbon",
      outlook: { status: "none", lastSyncedAt: null },
      view: "day",
      date: "2026-11-17",
      today: "2026-11-17",
      monday: "2026-11-16",
      previous: "2026-11-16",
      next: "2026-11-18",
      thisWeek: "2026-11-16",
      days: [{ date: "2026-11-17", label: "2026-11-17", isToday: true, events, allDay: [] }],
      lead: [],
    };
    return renderToStaticMarkup(
      <DisplayProvider value={DEFAULT_DISPLAY}>
        <Announcer>
          <CalendarView week={data} nowLocal="2026-11-17T08:10" goals={[]} />
        </Announcer>
      </DisplayProvider>,
    );
  }

  it("a block of 2 hours with to-dos shows '1/3' (and says it in words)", () => {
    const html = render([event("e1", "Study", "2026-11-17T12:00", "2026-11-17T14:00", { todoCount: 3, todosDone: 1 })]);
    expect(html).toMatch(/tabular opacity-80">1\/3<\/span>/);
    expect(html).toContain("1 of 3 to-dos done");
  });

  it("no count without to-dos, and none on a block too short for it (30 minutes)", () => {
    expect(render([event("e1", "Study", "2026-11-17T12:00", "2026-11-17T14:00")])).not.toMatch(/\d\/\d<\/span>/);
    const short = render([event("e1", "Study", "2026-11-17T12:00", "2026-11-17T12:30", { todoCount: 3, todosDone: 1 })]);
    expect(short).not.toContain("1/3</span>");
    expect(short).toContain("1 of 3 to-dos done");
  });
});

describe("what is sent", () => {
  it("'Add event' sends the new event's list; none is left out", () => {
    const values = newValues({ start: "2026-11-17T12:00", end: "2026-11-17T13:00", title: "Study" });
    expect(createBody(values, null, [{ title: "Read", done: false }])).toMatchObject({ todos: [{ title: "Read", done: false }] });
    expect(createBody(values, null)).not.toHaveProperty("todos");
  });

  it("Undo of a delete brings the event back with the to-dos the delete's answer named (R38)", () => {
    const answer: PostResult = { ok: true, status: 200, message: "Event deleted.", data: { message: "Event deleted.", todos: [{ title: "Read", done: true }, { title: 5 }] } };
    const todos = deletedTodos(answer);
    expect(todos).toEqual([{ title: "Read", done: true }]);
    expect(recreateBody(event("e1", "Study", "2026-11-17T12:00", "2026-11-17T13:00"), todos)).toMatchObject({ title: "Study", todos: [{ title: "Read", done: true }] });
    expect(deletedTodos({ ok: true, status: 200, message: "", data: { message: "Event deleted." } })).toEqual([]);
  });
});
