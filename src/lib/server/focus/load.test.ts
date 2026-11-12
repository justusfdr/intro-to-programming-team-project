// Tests for the Focus page's data (R13, R3).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "@test/support/app";
import { seedEvent } from "@test/support/events";
import { seedSession } from "@test/support/sessions";
import { loadFocus } from "./load";

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.reset(); // Monday 16 November 2026, 09:00 UTC
});

describe("loadFocus", () => {
  it("finishes a running session whose planned end has passed, at start + planned + paused time (R13)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedSession(app.db, alice, { plannedMinutes: 30, startedAt: "2026-11-16T08:00:00Z", pausedSeconds: 300 });

    const data = await loadFocus(app.deps, alice);

    expect(data.active).toBeNull();
    expect(data.recent).toMatchObject([{ status: "finished", endedAt: "2026-11-16T08:35:00.000Z", focusedMinutes: 30 }]);
  });

  it("keeps a paused session paused however long ago it was paused (R13)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedSession(app.db, alice, { plannedMinutes: 15, status: "paused", startedAt: "2026-11-15T08:00:00Z", pausedAt: "2026-11-15T08:05:00Z" });
    expect((await loadFocus(app.deps, alice)).active).toMatchObject({ status: "paused" });
  });

  it("lists finished sessions newest first with focused minutes (A2's 45)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedSession(app.db, alice, { status: "finished", startedAt: "2026-11-13T09:00:00Z", pausedSeconds: 600, endedAt: "2026-11-13T09:55:00Z", rating: 4 });
    await seedSession(app.db, alice, { status: "finished", startedAt: "2026-11-14T09:00:00Z", endedAt: "2026-11-14T09:30:00Z" });
    const data = await loadFocus(app.deps, alice);
    expect(data.recent.map((s) => [s.focusedMinutes, s.rating])).toEqual([
      [30, null],
      [45, 4],
    ]);
  });

  it("suggests a length for the user's own event and ignores another user's event (R3)", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const bobs = await seedEvent(app.db, bob, { title: "Bob's", start: "2026-11-16T10:00:00Z", end: "2026-11-16T11:00:00Z" });
    const alice = await app.signedInAs("alice@example.com");
    const own = await seedEvent(app.db, alice, { title: "Statistics revision", start: "2026-11-16T10:00:00Z", end: "2026-11-16T10:45:00Z" });

    expect((await loadFocus(app.deps, alice, own.id)).forEvent).toEqual({ id: own.id, title: "Statistics revision", suggestedMinutes: 60 });
    expect((await loadFocus(app.deps, alice, bobs.id)).forEvent).toBeNull();
    expect((await loadFocus(app.deps, alice, "not-a-uuid")).forEvent).toBeNull();
  });

  it("shows only the signed-in user's sessions (R3)", async () => {
    const bob = await app.signedInAs("bob@example.com");
    await seedSession(app.db, bob, { startedAt: "2026-11-16T08:50:00Z" });
    const alice = await app.signedInAs("alice@example.com");
    expect(await loadFocus(app.deps, alice)).toMatchObject({ active: null, recent: [] });
  });
});
