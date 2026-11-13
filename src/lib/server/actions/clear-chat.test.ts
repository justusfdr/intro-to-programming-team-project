// Tests for clear_chat (spec 19; ontology section 5, always allowed): the user's messages and drafts go,
// the events (also those made from a draft) and today's count stay, and another user's chat is untouched.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { A5_PROPOSALS, chatOf, seedDraft, sentToday, setSentToday } from "@test/support/chat";
import { eventsOf } from "@test/support/events";
import { acceptDraft } from "./accept-draft";
import { clearChat } from "./clear-chat";

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

function clear(headers?: Record<string, string>) {
  return clearChat(postJson("/api/chat/clear", {}, headers), app.deps);
}

describe("clear_chat", () => {
  it("deletes the user's messages and drafts; events and today's count stay; another user's chat stays", async () => {
    const bob = await app.signedInAs("bob@example.com");
    await seedDraft(app.db, bob, A5_PROPOSALS);
    const alice = await app.signedInAs("alice@example.com");
    const accepted = await seedDraft(app.db, alice, A5_PROPOSALS.slice(0, 1));
    expect((await acceptDraft(postJson("/x", {}), app.deps, accepted.draftId)).status).toBe(201);
    await seedDraft(app.db, alice, A5_PROPOSALS.slice(1));
    await setSentToday(app.db, alice, 7);

    expect(await read(await clear())).toEqual({ status: 200, body: { message: "Chat cleared." } });

    expect(await chatOf(app.db, alice)).toEqual([]);
    expect(await app.db.admin("select * from app.draft_plans where user_id = $1", [alice])).toEqual([]);
    expect(await eventsOf(app.db, alice)).toHaveLength(1);
    expect(await sentToday(app.db, alice)).toBe(7);
    expect(await chatOf(app.db, bob)).toHaveLength(2);
  });

  it("is allowed with an empty chat", async () => {
    await app.signedInAs("alice@example.com");
    expect((await clear()).status).toBe(200);
  });

  it("answers 401 without a session and 403 from another site; nothing deleted", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedDraft(app.db, alice, A5_PROPOSALS);
    expect((await clear({ origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status).toBe(403);
    await app.auth.signOut();
    expect((await clear()).status).toBe(401);
    expect(await chatOf(app.db, alice)).toHaveLength(2);
  });
});
