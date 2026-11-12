// The blocker card's markup (spec 05): connection status in words (R18), blocking state (R15), the list.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { BlockerData } from "@/lib/blocker/types";
import { BlockerCard } from "./BlockerCard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const DATA: BlockerData = {
  sites: [
    { id: "1", domain: "youtube.com" },
    { id: "2", domain: "instagram.com" },
  ],
  connected: true,
  blockingOn: false,
  blockingUntil: null,
  timeZone: "Europe/Lisbon",
};

describe("blocker card", () => {
  it("says 'Blocker not connected: nothing is being blocked' when the extension has not asked (R18)", () => {
    const html = renderToStaticMarkup(<BlockerCard data={{ ...DATA, connected: false }} />);
    expect(html).toContain("Blocker not connected: nothing is being blocked");
  });

  it("says until when blocking lasts, in the user's time zone (R15)", () => {
    const html = renderToStaticMarkup(<BlockerCard data={{ ...DATA, blockingOn: true, blockingUntil: "2026-07-16T10:30:00.000Z" }} />);
    expect(html).toContain("Blocker connected. Blocking until 11:30.");
  });

  it("lists the sites with a named remove button each, the count, and an add field with a label", () => {
    const html = renderToStaticMarkup(<BlockerCard data={DATA} />);
    expect(html).toContain('aria-label="Remove youtube.com"');
    expect(html).toContain('aria-label="Remove instagram.com"');
    expect(html).toContain("2 of 50");
    expect(html).toMatch(/<label[^>]*for="blocked-site"/);
    expect(html).toContain("Get the Chrome extension");
  });
});
