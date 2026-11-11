// Tests for the shared helpers of edit_event, delete_event and mark_event_done (R3, R4).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "@test/support/app";
import { seedEvent } from "@test/support/events";
import { ActionError } from "@/lib/server/errors";
import { assertUnchangedSince, findOwnEvent } from "./own-event";

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.reset();
});

const TIMES = { start: "2026-11-17T09:00:00Z", end: "2026-11-17T10:00:00Z" };

async function errorOf(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    if (error instanceof ActionError) return { status: error.status, code: error.code, message: error.message };
    throw error;
  }
  return "no error";
}

describe("findOwnEvent (R3: another user's event does not exist for you)", () => {
  it("returns the user's own event", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { id } = await seedEvent(app.db, alice, TIMES);
    const row = await app.db.withUser(alice, (q) => findOwnEvent(q, id));
    expect(row).toMatchObject({ id, title: "Statistics revision" });
  });

  it("answers exactly the same 'Not found' for another user's event, a missing event and a malformed id", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const { id: bobsEvent } = await seedEvent(app.db, bob, TIMES);
    const alice = await app.signedInAs("alice@example.com");

    const othersEvent = await errorOf(() => app.db.withUser(alice, (q) => findOwnEvent(q, bobsEvent)));
    const missing = await errorOf(() =>
      app.db.withUser(alice, (q) => findOwnEvent(q, "00000000-0000-4000-8000-000000000000")),
    );
    const malformed = await errorOf(() => app.db.withUser(alice, (q) => findOwnEvent(q, "not-a-uuid")));

    expect(othersEvent).toEqual({ status: 404, code: "not_found", message: "Not found" });
    expect(missing).toEqual(othersEvent);
    expect(malformed).toEqual(othersEvent);
  });
});

describe("assertUnchangedSince (R4)", () => {
  it("accepts the updated_at the device last saw, and rejects an older one or a made-up value", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { id, updatedAt } = await seedEvent(app.db, alice, TIMES);
    const row = await app.db.withUser(alice, (q) => findOwnEvent(q, id));

    expect(() => assertUnchangedSince(row, updatedAt)).not.toThrow();
    const older = new Date(Date.parse(updatedAt) - 1).toISOString();
    for (const stale of [older, "yesterday", ""]) {
      expect(await errorOf(async () => assertUnchangedSince(row, stale)), stale).toEqual({
        status: 409,
        code: "changed_elsewhere",
        message: "Changed on another device. Reload to see the latest version",
      });
    }
  });
});
