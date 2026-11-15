// The markup of the lists pages (spec 30): the overview with "New list", "by <name>", the open count and
// the avatars, and one quiet sentence when empty; one list for its owner (rename, Share, Delete list)
// and for a member (Leave list only); entries open first and done ones last, with named tick rings,
// arrows, delete, who added or ticked, "Hide done" and "Add an entry"; the Share panel's sentence;
// "Lists" in the sidebar but not in the phone tab bar, and the way there from the goals panel.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GoalsPanel } from "@/components/goals/GoalsPanel";
import { AppShell } from "@/components/shell/AppShell";
import { PanelState } from "@/components/shell/PanelState";
import type { ListDetail, ListPageData, ListSummary } from "@/lib/lists/types";
import { ListsView, EMPTY_LISTS } from "./ListsView";
import { ListView } from "./ListView";
import { SharePanel } from "./SharePanel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const LEA = { userId: "u1", name: "Lea Martins", photoUrl: "/api/profiles/u1/photo?v=5", isOwner: true, isMe: false };
const BEN = { userId: "u2", name: "Ben", photoUrl: null, isOwner: false, isMe: true };
const at = "2026-11-16T09:00:00.000Z";

const SUMMARIES: ListSummary[] = [
  { id: "l1", title: "Flat shopping", isOwner: false, ownerName: "Lea Martins", openCount: 2, people: [LEA, BEN] },
  { id: "l2", title: "Packing", isOwner: true, ownerName: "Ben", openCount: 0, people: [{ ...BEN, isOwner: true }] },
];

const LIST: ListDetail = {
  id: "l1",
  title: "Flat shopping",
  updatedAt: at,
  isOwner: false,
  people: [LEA, BEN],
  entries: [
    { id: "e1", title: "Milk", done: true, position: 0, updatedAt: at, addedBy: "u1", doneBy: "u2" },
    { id: "e2", title: "Eggs", done: false, position: 1, updatedAt: at, addedBy: "u1", doneBy: null },
    { id: "e3", title: "Bread", done: false, position: 2, updatedAt: at, addedBy: null, doneBy: null },
  ],
};

const asMember: ListPageData = { list: LIST, contacts: [] };
const asOwner: ListPageData = {
  list: { ...LIST, isOwner: true, people: [{ ...LEA, isMe: true }, { ...BEN, isMe: false }] },
  contacts: [{ contactId: "c1", userId: "u2", name: "Ben", photoUrl: null }],
};

describe("the lists overview", () => {
  it("has the title, the labelled New list field, and one quiet sentence when there are no lists", () => {
    const html = renderToStaticMarkup(<ListsView lists={[]} />);
    expect(html).toContain(">Lists</h1>");
    expect(html).toMatch(/<label for="([^"]+)" class="sr-only">Title of the new list<\/label><input id="\1"/);
    expect(html).toContain(">New list</button>");
    expect(html).toContain(EMPTY_LISTS);
  });

  it("shows each list with its owner, the open count and the people", () => {
    const html = renderToStaticMarkup(<ListsView lists={SUMMARIES} />);
    expect(html).toMatch(/<a href="\/lists\/l1"[^>]*>.*Flat shopping.*by Lea Martins · 2 open/s);
    expect(html).toMatch(/<a href="\/lists\/l2"[^>]*>.*Packing.*Yours · 0 open/s);
    expect(html).toContain("Shared by Lea Martins (owner) and you");
    expect(html).toContain('src="/api/profiles/u1/photo?v=5"');
  });
});

describe("one list", () => {
  it("shows open entries first and the done one last, dimmed, with named tick rings, arrows and delete", () => {
    const html = renderToStaticMarkup(<ListView data={asMember} />);
    const order = ["Eggs", "Bread", "Milk"].map((t) => html.indexOf(`aria-label="Rename &#x27;${t}&#x27;"`));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toMatch(/aria-label="Tick &#x27;Eggs&#x27;" aria-pressed="false"/);
    expect(html).toMatch(/aria-label="Untick &#x27;Milk&#x27;" aria-pressed="true"/);
    expect(html).toMatch(/<li class="[^"]*opacity-60[^"]*">.*?Milk/);
    // The first open entry cannot move up; the last open one cannot move down.
    expect(html).toMatch(/disabled="" aria-label="Move &#x27;Eggs&#x27; up"/);
    expect(html).toMatch(/disabled="" aria-label="Move &#x27;Bread&#x27; down"/);
    expect(html).toContain('aria-label="Delete &#x27;Bread&#x27;"');
  });

  it("shows who added an open entry and who ticked a done one", () => {
    const html = renderToStaticMarkup(<ListView data={asMember} />);
    expect(html).toContain('alt="Added by Lea Martins"');
    expect(html).toContain('aria-label="Ticked by you"');
  });

  it("has Hide done and the labelled Add an entry field", () => {
    const html = renderToStaticMarkup(<ListView data={asMember} />);
    expect(html).toMatch(/<button type="button" aria-pressed="false"[^>]*>.*Hide done<\/button>/);
    expect(html).toMatch(/<label for="([^"]+)" class="sr-only">Add an entry to Flat shopping<\/label><input id="\1"[^>]*placeholder="Add an entry"/);
  });

  it("for a member: who owns it and Leave list; no rename, no Share, no Delete list", () => {
    const html = renderToStaticMarkup(<ListView data={asMember} />);
    expect(html).toContain(">Flat shopping</h1>");
    expect(html).toContain("A list by Lea Martins");
    expect(html).toContain("Leave list");
    expect(html).not.toContain("Rename the list");
    expect(html).not.toContain(">Share<");
    expect(html).not.toContain("Delete list");
    expect(html).not.toContain("@");
  });

  it("for the owner: rename, Share (closed) and Delete list; no Leave list", () => {
    const html = renderToStaticMarkup(<ListView data={asOwner} />);
    expect(html).toContain("Your list");
    expect(html).toContain('aria-label="Rename the list"');
    expect(html).toMatch(/<button type="button" class="[^"]*" aria-expanded="false">.*?Share<\/button>/);
    expect(html).toContain("Delete list");
    expect(html).not.toContain("Leave list");
  });
});

describe("the Share panel", () => {
  it("says what adding someone means, and offers Remove for a member", () => {
    const people = [{ ...LEA, isMe: true }];
    const contacts = [
      { contactId: "c1", userId: "u2", name: "Ben", photoUrl: null },
      { contactId: "c2", userId: "u3", name: "Carol", photoUrl: null },
    ];
    const none = renderToStaticMarkup(<SharePanel id="s" contacts={contacts} people={people} busy={false} onAdd={() => {}} onRemove={() => {}} />);
    expect(none).toContain("Ben will see this list and its entries at once.");
    expect(none).toMatch(/aria-label="Add Ben\. Ben will see this list and its entries at once\."[^>]*>Add<\/button>/);
    const withBen = renderToStaticMarkup(
      <SharePanel id="s" contacts={contacts} people={[...people, { ...BEN, isMe: false }]} busy={false} onAdd={() => {}} onRemove={() => {}} />,
    );
    expect(withBen).toContain("In this list");
    expect(withBen).toMatch(/aria-label="Remove Ben from this list"[^>]*>Remove<\/button>/);
    expect(withBen).toContain("Carol will see this list and its entries at once.");
  });

  it("points to People when the owner has no contacts", () => {
    const html = renderToStaticMarkup(<SharePanel id="s" contacts={[]} people={[LEA]} busy={false} onAdd={() => {}} onRemove={() => {}} />);
    expect(html).toMatch(/You have no contacts yet\. Invite someone on the <a href="\/people"/);
  });
});

describe("the way to the lists", () => {
  it("is in the sidebar, not in the phone tab bar, and in the goals panel", () => {
    const html = renderToStaticMarkup(<AppShell current="/lists">page</AppShell>);
    const bar = html.slice(html.indexOf('aria-label="Tab bar"'));
    expect(bar).not.toContain("/lists");
    const panel = renderToStaticMarkup(
      <PanelState>
        <GoalsPanel goals={[]} tasks={[]} today="2026-11-16" />
      </PanelState>,
    );
    expect(panel).toMatch(/<a href="\/lists"[^>]*>.*Shared lists<\/a>/s);
  });
});
