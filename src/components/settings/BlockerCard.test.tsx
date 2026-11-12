// The blocker card's markup (spec 05): connection status in words (R18), blocking state (R15), the list.
// Rewritten for the prototype-style branch (spec 12): the card moved from the Focus page to Settings in
// the prototype's layout; the time reads "11:30am" (12-hour by default).
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
    expect(html).toContain(">Not connected</span>");
    expect(html).toContain("Install the extension");
  });

  it("says until when blocking lasts, in the user's time zone (R15)", () => {
    const html = renderToStaticMarkup(<BlockerCard data={{ ...DATA, blockingOn: true, blockingUntil: "2026-07-16T10:30:00.000Z" }} />);
    expect(html).toContain("Blocker connected. Blocking until 11:30am.");
  });

  it("lists the sites with a named remove button each, the count, and an add field with a real label", () => {
    const html = renderToStaticMarkup(<BlockerCard data={DATA} />);
    expect(html).toContain('aria-label="Remove youtube.com"');
    expect(html).toContain('aria-label="Remove instagram.com"');
    expect(html).toContain("2 of 50");
    const id = html.match(/<input id="([^"]+)"[^>]*name="domain"/)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`<label for="${id}" class="sr-only">Website to block</label>`);
    expect(html).toContain("Install on another computer");
  });

  it("can be reached from the Focus page's chip (#blocker)", () => {
    expect(renderToStaticMarkup(<BlockerCard data={DATA} />)).toMatch(/^<div class="[^"]*scroll-mt-6[^"]*" id="blocker" role="region"/);
  });
});
