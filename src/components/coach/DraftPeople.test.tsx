// Spec 37 on the coach's screen (R66, R67): a proposed event that invites people shows them under the
// draft with their photo or initials and name, a button to take each one off while the draft is open,
// and for a demo contact the sentence that they get no invitation. The two notice sentences: under the
// calendar choice when the calendar is shared, and in the coach's "What is sent?".
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ShareRow } from "@/components/people/ShareRow";
import { DisplayProvider } from "@/components/shell/DisplayProvider";
import type { DraftDto } from "@/lib/chat/types";
import { DEFAULT_DISPLAY } from "@/lib/time/display";
import { WhatIsSent } from "./Composer";
import { DraftCard } from "./DraftCard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const DRAFT: DraftDto = {
  id: "d1",
  status: "open",
  version: 0,
  events: [
    {
      title: "Sport",
      startAt: "2026-11-17T18:30:00.000Z",
      endAt: "2026-11-17T19:30:00.000Z",
      goalId: null,
      people: [
        { key: "c-emily", name: "Emily Stone", photoUrl: "/api/profiles/u-emily/photo?v=1" },
        { key: "demo-lea", name: "Lea Sousa", photoUrl: null, demo: { initials: "LS", color: "#0f766e" } },
      ],
    },
    { title: "Study", startAt: "2026-11-17T10:00:00.000Z", endAt: "2026-11-17T11:00:00.000Z", goalId: null },
  ],
  changes: [],
};

const render = (draft: DraftDto) =>
  renderToStaticMarkup(
    <DisplayProvider value={DEFAULT_DISPLAY}>
      <DraftCard draft={draft} goals={[]} timeZone="Europe/Lisbon" calendar={[]} onStatus={() => {}} />
    </DisplayProvider>,
  );

describe("the people of a draft", () => {
  it("lists each invited person under the event with photo or initials and name, and the demo sentence", () => {
    const html = render(DRAFT);
    expect(html).toContain('aria-label="Invited people"');
    expect(html).toMatch(/>Sport<\/span><span[^>]*>Tue, Nov 17, 6:30 – 7:30pm<\/span>/);
    expect(html).toContain('aria-label="Invited to Sport"');
    expect(html).toContain('src="/api/profiles/u-emily/photo?v=1"');
    expect(html).toContain(">Emily Stone</span>");
    expect(html).toMatch(/style="width:24px;height:24px;background-color:#0f766e"[^>]*>LS<\/span>/);
    expect(html).toContain(">Demo</span>");
    expect(html).toContain("Lea Sousa is a demo contact and gets no invitation.");
    expect(html).toContain("Applying the draft invites them: they see the event in their calendar and answer it.");
    // An event without people is not listed there.
    expect(html).not.toContain('aria-label="Invited to Study"');
  });

  it("while open, each person can be taken off (never added); an accepted draft only lists them", () => {
    const html = render(DRAFT);
    expect(html).toContain('aria-label="Take Emily Stone off Sport"');
    expect(html).toContain('aria-label="Take Lea Sousa off Sport"');
    expect(html).not.toMatch(/aria-label="(Add|Invite) /);
    const accepted = render({ ...DRAFT, status: "accepted" });
    expect(accepted).toContain(">Emily Stone</span>");
    expect(accepted).not.toContain("Take Emily Stone off");
    expect(accepted).not.toContain("Applying the draft invites them");
  });

  it("someone who is no longer a contact is marked so; a draft without people has no such section", () => {
    const gone = render({ ...DRAFT, events: [{ ...DRAFT.events[0], people: [{ key: "c-x", name: "No longer a contact", photoUrl: null, gone: true }] }] });
    expect(gone).toContain('class="italic text-ink-3">No longer a contact</span>');
    expect(render({ ...DRAFT, events: [DRAFT.events[1]] })).not.toContain("Invited people");
  });
});

describe("the notice sentences (R66)", () => {
  const NOTICE = "Dave can ask their Coach to find a time with you. The Coach then gets your busy times, without titles or places, and they are sent to the AI provider.";
  const row = (calendar: "none" | "busy" | "details", demo = false) =>
    renderToStaticMarkup(<ShareRow contactId="c1" userId="u3" name="Dave" out={{ calendar, focus: false }} shared={{ calendar: "none", focus: false }} demo={demo} />);

  it("is under the calendar choice whenever the calendar is shared, at both levels", () => {
    expect(row("busy")).toContain(NOTICE);
    expect(row("details")).toContain(NOTICE);
  });

  it("is not there while the calendar is not shared, nor for a demo contact", () => {
    expect(row("none")).not.toContain("find a time with you");
    expect(row("busy", true)).not.toContain("find a time with you");
  });

  it("the coach's own description of what is sent names the contacts' busy times", () => {
    const html = renderToStaticMarkup(<WhatIsSent />);
    expect(html).toContain("If you name a contact who shares their calendar with you: their name and their busy times for the next 14 days (no titles, no places).");
  });
});
