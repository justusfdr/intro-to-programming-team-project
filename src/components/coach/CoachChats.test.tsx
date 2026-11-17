// Spec 44: the coach's chats in the list left of the conversation: grouped by day ("Today",
// "Yesterday", a date), newest first, the chat on the screen marked, "New chat" at the bottom, and
// "Delete chat" only for a chat that exists. English only: no language switch next to the microphone.
// The search: a field above the list, the results with the words marked, and the found message marked.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DisplayProvider } from "@/components/shell/DisplayProvider";
import type { ChatPageData } from "@/lib/chat/types";
import { ChatList, ChatSearchResults } from "./ChatList";
import { CoachView } from "./CoachView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {}, replace() {} }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const CHATS = [
  { id: "c-today-late", title: "Plan the gym into my week", updatedAt: "2026-11-17T19:00:00.000Z" },
  { id: "c-today-early", title: "Study for exams", updatedAt: "2026-11-17T08:00:00.000Z" },
  { id: "c-yesterday", title: "Football on Saturday", updatedAt: "2026-11-16T12:00:00.000Z" },
  { id: "c-friday", title: "A long week", updatedAt: "2026-11-13T12:00:00.000Z" },
];

function page(fields: Partial<ChatPageData>) {
  const data: ChatPageData = {
    display: { timeFormat: "24h", dayStartHour: 7, dayEndHour: 21 },
    timeZone: "Europe/Lisbon",
    chats: CHATS,
    chatId: null,
    now: "2026-11-17T20:00:00.000Z",
    messages: [],
    draftDayEvents: [],
    draftDays: [],
    goals: [],
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

describe("the chat list", () => {
  it("groups the chats by day, newest first, each a link to its chat", () => {
    const html = renderToStaticMarkup(
      <ChatList chats={CHATS} currentId="c-yesterday" timeZone="Europe/Lisbon" now={new Date("2026-11-17T20:00:00.000Z")} />,
    );
    const order = ["Today", "Plan the gym into my week", "Study for exams", "Yesterday", "Football on Saturday", "Fri, Nov 13", "A long week"];
    const at = order.map((text) => html.indexOf(`>${text}<`));
    expect(at.every((i) => i >= 0), JSON.stringify(at)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(html).toContain('href="/coach?chat=c-today-early"');
    expect(html).toMatch(/href="\/coach\?chat=c-yesterday" aria-current="page"/);
  });

  it("has 'New chat' at the bottom, after the last chat", () => {
    const html = renderToStaticMarkup(<ChatList chats={CHATS} currentId={null} timeZone="UTC" now={new Date("2026-11-17T20:00:00.000Z")} />);
    expect(html).toMatch(/href="\/coach\?chat=new" aria-current="page"/);
    expect(html.indexOf("New chat")).toBeGreaterThan(html.indexOf("A long week"));
  });

  it("says where chats will show when there are none", () => {
    const html = renderToStaticMarkup(<ChatList chats={[]} currentId={null} timeZone="UTC" now={new Date()} />);
    expect(html).toContain("Your chats show up here, by day.");
    expect(html).toContain("New chat");
  });
});

describe("the coach page with chats", () => {
  it("shows the list beside the conversation and a button that opens it on phones", () => {
    const html = page({});
    expect(html).toContain('aria-label="Chats"');
    expect(html).toContain('aria-label="Show chats"');
    expect(html).toContain("Plan the gym into my week");
  });

  it("a new chat: titled 'New chat', no 'Delete chat'", () => {
    const html = page({ chatId: null });
    expect(html).toContain(">New chat</p>");
    expect(html).not.toContain("Delete chat");
  });

  it("a chat that exists: its title in the header and 'Delete chat'", () => {
    const html = page({ chatId: "c-today-early" });
    expect(html).toContain(">Study for exams</p>");
    expect(html).toContain("Delete chat");
  });

  it("English only: no language switch", () => {
    const html = page({});
    expect(html).not.toContain("Speech language");
    expect(html).not.toMatch(/>DE</);
  });
});

describe("searching chats", () => {
  const NOW = new Date("2026-11-17T20:00:00.000Z");

  it("has a search field above the list", () => {
    const html = renderToStaticMarkup(<ChatList chats={CHATS} currentId={null} timeZone="Europe/Lisbon" now={NOW} />);
    expect(html).toContain(">Search chats</label>");
    expect(html).toMatch(/<input[^>]*type="search"[^>]*placeholder="Search chats"/);
    expect(html.indexOf("Search chats")).toBeLessThan(html.indexOf("Today"));
  });

  it("shows each chat found with its day and an excerpt, the words marked, linked to the message", () => {
    const html = renderToStaticMarkup(
      <ChatSearchResults
        results={[
          { chat: CHATS[0], messageId: "4b1c7a2e-0000-4000-8000-000000000001", excerpt: "…put the Gym on Monday and Thursday…" },
          { chat: CHATS[3], messageId: null, excerpt: null },
        ]}
        words={["gym"]}
        currentId={null}
        timeZone="Europe/Lisbon"
        now={NOW}
      />,
    );
    expect(html).toContain('href="/coach?chat=c-today-late&amp;message=4b1c7a2e-0000-4000-8000-000000000001"');
    expect(html).toContain('href="/coach?chat=c-friday"');
    expect(html).toContain("Plan the </span><mark");
    expect(html).toMatch(/<mark[^>]*>gym<\/mark>/);
    expect(html).toMatch(/<mark[^>]*>Gym<\/mark>/);
    expect(html).toContain(">Today<");
    expect(html).toContain(">Fri, Nov 13<");
  });

  it("says when no chat contains the words", () => {
    const html = renderToStaticMarkup(<ChatSearchResults results={[]} words={["zebra"]} currentId={null} timeZone="UTC" now={NOW} />);
    expect(html).toContain("No chats contain these words.");
  });

  it("the message a search found has its own id and is marked; the others are not", () => {
    const message = (id: string, text: string) => ({ id, role: "user" as const, text, createdAt: "2026-11-17T08:00:00.000Z", draft: null });
    const html = renderToStaticMarkup(
      <DisplayProvider value={{ timeFormat: "24h", dayStartHour: 7, dayEndHour: 21 }}>
        <CoachView
          data={{
            display: { timeFormat: "24h", dayStartHour: 7, dayEndHour: 21 },
            timeZone: "Europe/Lisbon",
            chats: CHATS,
            chatId: "c-today-early",
            now: "2026-11-17T20:00:00.000Z",
            messages: [message("m-1", "First"), message("m-2", "The gym one")],
            draftDayEvents: [],
            draftDays: [],
            goals: [],
            chatAllowed: true,
            assistantConfigured: true,
          }}
          focusMessageId="m-2"
        />
      </DisplayProvider>,
    );
    expect(html).toMatch(/<li id="message-m-2" class="[^"]*search-hit/);
    expect(html).toMatch(/<li id="message-m-1" class="flex justify-end "/);
  });
});
