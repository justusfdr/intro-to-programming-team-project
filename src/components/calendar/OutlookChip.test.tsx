// The Outlook status chip in the calendar's toolbar (spec 08, moved to the prototype's chip in spec 12).
// Rewritten from the Outlook panel's test: connecting, reconnecting and disconnecting now live in
// Settings (see src/components/settings/OutlookCard.test.tsx); the chip shows the status and links there.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DisplayProvider } from "@/components/shell/DisplayProvider";
import type { OutlookView } from "@/lib/events/types";
import { DEFAULT_DISPLAY } from "@/lib/time/display";
import { OutlookChip } from "./OutlookChip";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const render = (outlook: OutlookView, available = true, timeFormat: "12h" | "24h" = "12h") =>
  renderToStaticMarkup(
    <DisplayProvider value={{ ...DEFAULT_DISPLAY, timeFormat }}>
      <OutlookChip outlook={outlook} available={available} timeZone="Europe/Lisbon" today="2026-11-17" />
    </DisplayProvider>,
  );

describe("Outlook chip", () => {
  it("not set up on this server and not connected: shows nothing", () => {
    expect(render({ status: "none", lastSyncedAt: null }, false)).toBe("");
  });

  it("not connected: a 'Connect Outlook' pill that links to Settings", () => {
    const html = render({ status: "none", lastSyncedAt: null });
    expect(html).toMatch(/<a href="\/settings#outlook"[^>]*>.*Connect Outlook<\/a>/);
    expect(html).not.toContain("/api/outlook/connect");
  });

  it("connected: the last sync in the user's time format, and a named Sync button", () => {
    expect(render({ status: "connected", lastSyncedAt: "2026-11-17T08:40:00.000Z" })).toContain(">Outlook · Last synced 8:40am</a>");
    expect(render({ status: "connected", lastSyncedAt: "2026-11-16T13:05:00.000Z" })).toContain(">Outlook · Last synced Nov 16, 1:05pm</a>");
    expect(render({ status: "connected", lastSyncedAt: "2026-11-17T08:40:00.000Z" }, true, "24h")).toContain(">Outlook · Last synced 8:40</a>");
    expect(render({ status: "connected", lastSyncedAt: null })).toContain(">Outlook · Not synced yet</a>");
    expect(render({ status: "connected", lastSyncedAt: null })).toContain('aria-label="Sync Outlook now"');
  });

  it("needs_reconnect: says 'Sign in again' and links to Settings", () => {
    const html = render({ status: "needs_reconnect", lastSyncedAt: null });
    expect(html).toMatch(/<a href="\/settings#outlook"[^>]*>Outlook · Sign in again<\/a>/);
  });
});
