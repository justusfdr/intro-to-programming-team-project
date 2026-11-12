// Tests for what the calendar says about the Outlook connection.
import { describe, expect, it } from "vitest";
import { lastSyncedText, signInResultMessage, statusText } from "./outlook-view";

describe("lastSyncedText", () => {
  it("says the local time today, the date before, and 'Not synced yet' before the first sync", () => {
    expect(lastSyncedText("2026-11-17T08:40:00.000Z", "Europe/Lisbon", "2026-11-17")).toBe("Last synced 08:40");
    expect(lastSyncedText("2026-11-17T08:40:00.000Z", "Europe/Berlin", "2026-11-17")).toBe("Last synced 09:40");
    expect(lastSyncedText("2026-11-16T08:40:00.000Z", "Europe/Lisbon", "2026-11-17")).toBe("Last synced 16 Nov, 08:40");
    expect(lastSyncedText(null, "Europe/Lisbon", "2026-11-17")).toBe("Not synced yet");
  });
});

describe("statusText and signInResultMessage", () => {
  it("name the three states and the two results of a sign-in", () => {
    expect(statusText({ status: "connected", lastSyncedAt: null })).toBe("Connected");
    expect(statusText({ status: "needs_reconnect", lastSyncedAt: null })).toBe("Sign in again");
    expect(statusText({ status: "none", lastSyncedAt: null })).toBe("Not connected");
    expect(signInResultMessage("connected")).toBe("Outlook connected.");
    expect(signInResultMessage("failed")).toBe("Outlook was not connected");
    expect(signInResultMessage("https://evil.example")).toBeNull();
  });
});
