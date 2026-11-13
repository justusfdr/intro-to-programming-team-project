// The coach's markup (spec 19, step B): the empty page with its starters, a conversation with an open
// draft drawn between the calendar's events, an added draft, and the three ways the field is off
// (not allowed, not set up, no messages left). The assistant's text is plain text.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DisplayProvider } from "@/components/shell/DisplayProvider";
import type { ChatMessageDto, ChatPageData } from "@/lib/chat/types";
import type { EventDto } from "@/lib/events/types";
import { MESSAGES } from "@/lib/messages";
import { CoachView, NOT_SET_UP } from "./CoachView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const EXAM = { id: "goal-exam", title: "Pass the statistics exam", look: { color: "indigo" as const, icon: "graduation" as const } };

const lecture: EventDto = {
  id: "ev-1",
  title: "Statistics lecture",
  allDay: false,
  startAt: "2026-11-17T09:00:00.000Z",
  endAt: "2026-11-17T10:30:00.000Z",
  firstDay: null,
  lastDay: null,
  mayOverlap: false,
  status: "planned",
  goalId: null,
  seriesId: null,
  source: "app",
  location: null,
  notSent: false,
  updatedAt: "2026-11-10T00:00:00.000Z",
};
const examWeek: EventDto = { ...lecture, id: "ev-2", title: "Exam week", allDay: true, startAt: null, endAt: null, firstDay: "2026-11-16", lastDay: "2026-11-20" };

const user = (text: string): ChatMessageDto => ({ id: `u-${text}`, role: "user", text, createdAt: "2026-11-16T20:00:00.000Z", draft: null });
const coach = (text: string, status: "open" | "accepted" | "rejected" | "replaced" | null): ChatMessageDto => ({
  id: `a-${text}`,
  role: "assistant",
  text,
  createdAt: "2026-11-16T20:00:30.000Z",
  draft:
    status === null
      ? null
      : {
          id: `draft-${status}`,
          status,
          events: [
            { title: "Study", startAt: "2026-11-17T11:00:00.000Z", endAt: "2026-11-17T13:00:00.000Z", goalId: EXAM.id },
            { title: "Football", startAt: "2026-11-17T20:00:00.000Z", endAt: "2026-11-17T22:00:00.000Z", goalId: null },
          ],
        },
});

function render(fields: Partial<ChatPageData>, timeFormat: "12h" | "24h" = "12h") {
  const data: ChatPageData = {
    display: { timeFormat, dayStartHour: 7, dayEndHour: 21 },
    timeZone: "Europe/Lisbon",
    messages: [],
    draftDayEvents: [],
    draftDays: [],
    goals: [EXAM],
    messagesLeft: 17,
    chatAllowed: true,
    assistantConfigured: true,
    ...fields,
  };
  return renderToStaticMarkup(
    <DisplayProvider value={data.display}>
      <CoachView data={data} />
    </DisplayProvider>,
  );
}

const openConversation = {
  messages: [user("Tomorrow: study 2 hours before lunch, football at 8 in the evening"), coach("Here is a plan for Tuesday.\nThe lecture stays where it is.", "open")],
  draftDayEvents: [lecture, examWeek],
  draftDays: ["2026-11-17"],
};

describe("coach page", () => {
  it("empty: the heading, the promise, four starters (one in German) and the counter", () => {
    const html = render({});
    expect(html).toContain("What should tomorrow look like?");
    expect(html).toContain("nothing changes until you add it");
    expect(html).toContain("17 of 20 messages left today");
    expect(html).toContain("Plane meinen Tag morgen: 4 Stunden lernen, abends Fußball schauen");
    expect(html).toContain("How much time did I spend on my goals last week?");
    const starters = html.slice(html.indexOf('aria-label="Ideas to start with"'), html.indexOf("</ul>", html.indexOf("Ideas to start with")));
    expect(starters.match(/<button/g)).toHaveLength(4);
    expect(html).toContain('placeholder="Tell the coach about your day…"');
    expect(html).toContain("What is sent?");
    // R22 in words (hidden until opened), with the sentence about speech (R24).
    expect(html).toContain("The last 10 messages of this chat");
    expect(html).toContain("your block list, your tasks");
    expect(html).toContain("We receive only the text.");
    // Nothing typed yet: the send button is off. No "Clear chat" without messages.
    expect(html).toMatch(/aria-label="Send" disabled=""/);
    expect(html).not.toContain("Clear chat");
    // The server renders no microphone: only the browser can tell whether it has speech recognition.
    expect(html).not.toContain('aria-label="Speak"');
  });

  it("a conversation with an open draft: the messages, the day drawn with the calendar's events, and the buttons", () => {
    const html = render(openConversation);
    expect(html).toContain("Clear chat");
    // The user's text and the coach's text, line breaks kept as plain text.
    expect(html).toContain("Tomorrow: study 2 hours before lunch, football at 8 in the evening");
    expect(html).toContain("Here is a plan for Tuesday.\nThe lecture stays where it is.");
    expect(html).toContain("whitespace-pre-wrap");
    expect(html).toContain("Draft for Tue, Nov 17");
    expect(html).toMatch(/>Draft<\/span>/);
    // The column is decoration; the list says the same for screen readers.
    expect(html).toContain('aria-hidden="true" class="flex"');
    expect(html).toContain("<li>Study, 11am to 1pm, goal Pass the statistics exam</li>");
    expect(html).toContain("<li>Football, 8pm to 10pm</li>");
    // The proposal in its goal's colour; the calendar's event and the all-day event around it.
    expect(html).toContain("bg-indigo-50");
    expect(html).toContain("Statistics lecture");
    expect(html).toContain("Exam week");
    // Hours from the hour before the first proposal (10am) to the hour after the last (11pm).
    expect(html).toContain(">10am<");
    expect(html).toContain(">10pm<");
    expect(html).not.toContain(">9am<");
    expect(html).toContain("Add to calendar");
    expect(html).toContain("Discard");
    expect(html).toContain("Or tell me what to change.");
  });

  it("shows hours and times in the user's 24-hour format", () => {
    const html = render(openConversation, "24h");
    expect(html).toContain(">10:00<");
    expect(html).toContain("<li>Study, 11:00 to 13:00, goal Pass the statistics exam</li>");
  });

  it("escapes the assistant's text: no HTML from the answer is rendered", () => {
    const html = render({ messages: [coach("<b>bold</b> and **stars**", null)] });
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt; and **stars**");
    expect(html).not.toContain("<b>bold</b>");
  });

  it("an added draft: the pill says Added, no buttons, a link to the day in the calendar, without the calendar's events", () => {
    const html = render({ messages: [user("Plan tomorrow"), coach("Done.", "accepted")] });
    expect(html).toMatch(/>Added<\/span>/);
    expect(html).not.toContain("Add to calendar");
    expect(html).not.toContain(">Discard<");
    expect(html).toContain('href="/?view=day&amp;date=2026-11-17"');
    expect(html).toContain("Open calendar");
    expect(html).not.toContain("Statistics lecture");
  });

  it("a replaced and a discarded draft are shown as such, without buttons", () => {
    const html = render({ messages: [coach("First try.", "replaced"), coach("Second try.", "rejected")] });
    expect(html).toMatch(/>Replaced<\/span>/);
    expect(html).toMatch(/>Discarded<\/span>/);
    expect(html).not.toContain("Add to calendar");
  });

  it("not allowed (Pro only): the ontology's sentence, the field off", () => {
    const html = render({ chatAllowed: false });
    expect(html).toContain(MESSAGES.chatProOnly);
    expect(html).toMatch(/<textarea[^>]*disabled=""/);
    expect(html).not.toContain("messages left today");
  });

  it("not set up on this server: a notice, the field off", () => {
    const html = render({ assistantConfigured: false });
    expect(html).toContain(NOT_SET_UP);
    expect(html).toMatch(/<textarea[^>]*disabled=""/);
  });

  it("no messages left today: the limit's sentence, the field off", () => {
    const html = render({ messagesLeft: 0, messages: [user("Hi"), coach("Hello.", null)] });
    expect(html).toContain("0 of 20 messages left today");
    expect(html).toContain(MESSAGES.chatLimit.replace("'", "&#x27;"));
    expect(html).toMatch(/<textarea[^>]*disabled=""/);
  });
});
