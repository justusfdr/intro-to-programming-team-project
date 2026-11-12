// The Outlook panel's markup in its three states (spec 08), as first rendered.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OutlookView } from "@/lib/events/types";
import { OutlookMenu } from "./OutlookMenu";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const render = (outlook: OutlookView, extra: { defaultConfirming?: boolean } = {}) =>
  renderToStaticMarkup(<OutlookMenu outlook={outlook} timeZone="Europe/Lisbon" today="2026-11-17" defaultOpen {...extra} />);

describe("Outlook panel", () => {
  it("not connected: explains and connects with a form POST to our own server", () => {
    const html = render({ status: "none", lastSyncedAt: null });
    expect(html).toMatch(/<form (method="post" action="\/api\/outlook\/connect"|action="\/api\/outlook\/connect" method="post")><button type="submit"/);
    expect(html).toContain(">Connect Outlook</button>");
    expect(html).not.toContain("Disconnect");
  });

  it("connected: the status, the last sync and Disconnect", () => {
    const html = render({ status: "connected", lastSyncedAt: "2026-11-17T08:40:00.000Z" });
    expect(html).toContain("Connected</p>");
    expect(html).toContain(">Last synced 08:40</p>");
    expect(html).toContain(">Disconnect Outlook</button>");
    expect(html).not.toContain("/api/outlook/connect");
  });

  it("needs_reconnect: says so and offers Reconnect Outlook", () => {
    const html = render({ status: "needs_reconnect", lastSyncedAt: "2026-11-16T08:40:00.000Z" });
    expect(html).toContain(">Outlook needs you to sign in again.</p>");
    expect(html).toContain(">Last synced 16 Nov, 08:40</p>");
    expect(html).toContain(">Reconnect Outlook</button>");
  });

  it("asks before disconnecting and says what stays in Outlook", () => {
    const html = render({ status: "connected", lastSyncedAt: null }, { defaultConfirming: true });
    expect(html).toContain(">Disconnect Outlook?</p>");
    expect(html).toContain("What this app wrote stays in Outlook.");
  });
});
