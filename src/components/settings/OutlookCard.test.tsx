// The Outlook card in Settings (spec 12; the actions of spec 08), as first rendered: one state each.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SettingsPageData } from "@/lib/settings/types";
import { OutlookCard } from "./OutlookCard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const render = (outlook: SettingsPageData["outlook"], available = true, defaultConfirming = false) =>
  renderToStaticMarkup(
    <OutlookCard outlook={outlook} outlookAvailable={available} today="2026-11-17" timeZone="Europe/Lisbon" defaultConfirming={defaultConfirming} />,
  );

describe("Outlook card", () => {
  it("is a named region with the prototype's title", () => {
    expect(render({ status: "none", lastSyncedAt: null })).toMatch(/role="region" aria-labelledby="[^"]+"/);
    expect(render({ status: "none", lastSyncedAt: null })).toContain(">Outlook calendar</h2>");
  });

  it("not set up on this server: says so plainly and offers no button", () => {
    const html = render({ status: "none", lastSyncedAt: null }, false);
    expect(html).toContain("Outlook is not set up on this server yet.");
    expect(html).toContain(">Not set up</span>");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("/api/outlook/connect");
  });

  it("not connected: signs in with a form POST to our own server", () => {
    const html = render({ status: "none", lastSyncedAt: null });
    expect(html).toMatch(/<form (method="post" action="\/api\/outlook\/connect"|action="\/api\/outlook\/connect" method="post")><button type="submit"/);
    expect(html).toContain(">Sign in with Microsoft</button>");
    expect(html).toContain(">Ready</span>");
    expect(html).not.toContain("Disconnect");
  });

  it("connected: the status, the last sync in 12-hour time, Sync now and Disconnect", () => {
    const html = render({ status: "connected", lastSyncedAt: "2026-11-17T08:40:00.000Z" });
    expect(html).toContain(">Connected</span>");
    expect(html).toContain(">Last synced 8:40am</p>");
    expect(html).toContain("Sync now</button>");
    expect(html).toContain(">Disconnect</button>");
    expect(html).not.toContain("/api/outlook/connect");
  });

  it("needs_reconnect: says so in words and offers to sign in again", () => {
    const html = render({ status: "needs_reconnect", lastSyncedAt: "2026-11-16T08:40:00.000Z" });
    expect(html).toContain(">Outlook needs you to sign in again.</p>");
    expect(html).toContain(">Last synced Nov 16, 8:40am</p>");
    expect(html).toContain(">Sign in again</button>");
    expect(html).toContain(">Sign in again</span>");
  });

  it("asks before disconnecting and says what stays in Outlook", () => {
    const html = render({ status: "connected", lastSyncedAt: null }, true, true);
    expect(html).toContain(">Disconnect Outlook?</p>");
    expect(html).toContain("What this app wrote stays in Outlook.");
  });
});
