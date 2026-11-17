// Spec 44: the coach keeps separate chats. send_message answers in the chat it names, starts a new chat
// with "new" (titled with the message), and without a chat goes into the latest one; Claude receives
// only that chat's messages; a chat that is gone saves nothing. delete_chat deletes one chat with its
// messages and drafts, never an event. The page shows the latest chat, a new one or the one asked for.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { A5_ANSWER, A5_PROPOSALS, chatOf, draftsOf, seedDraft } from "@test/support/chat";
import { eventsOf } from "@test/support/events";
import { loadChatPage } from "@/lib/server/pages/load";
import { acceptDraft } from "./accept-draft";
import { deleteChat } from "./delete-chat";
import { sendMessage } from "./send-message";

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.reset(); // Monday 16 November 2026, 09:00 UTC
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const send = (body: unknown, headers?: Record<string, string>) => sendMessage(postJson("/api/chat/messages", body, headers), app.deps);
const remove = (id: string, headers?: Record<string, string>) => deleteChat(postJson(`/api/chat/chats/${id}/delete`, {}, headers), app.deps, id);

type Saved = { chat: { id: string; title: string; updatedAt: string }; messages: { role: string; text: string }[] };

async function sendOk(body: unknown): Promise<Saved> {
  const answer = await read(await send(body));
  expect(answer.status).toBe(201);
  return answer.body as unknown as Saved;
}

const chatsOf = (userId: string) =>
  app.db.admin<{ id: string; title: string }>("select id, title from app.chats where user_id = $1 order by created_at, id", [userId]);

describe("send_message and chats", () => {
  it("'new' starts a chat titled with the message and answers in it", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const saved = await sendOk({ text: "  Plan my\nSaturday  ", chatId: "new" });

    expect(saved.chat).toMatchObject({ title: "Plan my Saturday" });
    expect(saved.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(await chatsOf(alice)).toEqual([{ id: saved.chat.id, title: "Plan my Saturday" }]);
  });

  it("answers in the chat it names; Claude receives only that chat's messages", async () => {
    await app.signedInAs("alice@example.com");
    const study = await sendOk({ text: "Study plan", chatId: "new" });
    await sendOk({ text: "Gym plan", chatId: "new" });

    await sendOk({ text: "And Friday?", chatId: study.chat.id });

    const history = app.assistant.lastData().history as { text: string }[];
    expect(history.map((m) => m.text)).toEqual(["Study plan", "Okay."]);
  });

  it("a new chat sends no earlier messages to Claude", async () => {
    await app.signedInAs("alice@example.com");
    await sendOk({ text: "Something earlier", chatId: "new" });
    await sendOk({ text: "Fresh start", chatId: "new" });
    expect(app.assistant.lastData().history).toEqual([]);
  });

  it("without a chat the turn goes into the latest one (as before chats existed)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await sendOk({ text: "Older", chatId: "new" });
    const newer = await sendOk({ text: "Newer", chatId: "new" });
    const saved = await sendOk({ text: "Next" });
    expect(saved.chat.id).toBe(newer.chat.id);
    expect(await chatsOf(alice)).toHaveLength(2);
  });

  it("another user's chat, an unknown one or no id: 'This chat no longer exists', Claude not called, nothing saved", async () => {
    await app.signedInAs("bob@example.com");
    const bobs = await sendOk({ text: "Bob's plan", chatId: "new" });
    const alice = await app.signedInAs("alice@example.com");
    app.assistant.reset();
    const before = await app.snapshot();

    for (const chatId of [bobs.chat.id, "7f1d5c3e-1a2b-4c3d-8e9f-0a1b2c3d4e5f", "not-an-id"]) {
      expect(await read(await send({ text: "Hi", chatId }))).toEqual({
        status: 404,
        body: { error: "chat_gone", message: "This chat no longer exists" },
      });
    }
    expect(app.assistant.requests).toEqual([]);
    expect(await app.snapshot()).toEqual(before);
    expect(await chatOf(app.db, alice)).toEqual([]);
  });

  it("a chat deleted while Claude was asked: nothing saved (R1)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const chat = await sendOk({ text: "First", chatId: "new" });
    const ask = app.assistant.ask.bind(app.assistant);
    vi.spyOn(app.assistant, "ask").mockImplementation(async (request) => {
      await remove(chat.chat.id);
      return ask(request);
    });

    expect((await read(await send({ text: "Second", chatId: chat.chat.id }))).body).toEqual({
      error: "chat_gone",
      message: "This chat no longer exists",
    });
    expect(await chatOf(app.db, alice)).toEqual([]);
    expect(await chatsOf(alice)).toEqual([]);
  });

  it("one open draft per user across chats: a draft in another chat replaces it", async () => {
    const alice = await app.signedInAs("alice@example.com");
    app.assistant.answerJson(A5_ANSWER);
    await sendOk({ text: "Plan Tuesday", chatId: "new" });
    app.assistant.answerJson({ ...A5_ANSWER, events: A5_ANSWER.events.slice(0, 1) });
    await sendOk({ text: "Only study", chatId: "new" });
    expect((await draftsOf(app.db, alice)).map((d) => d.status)).toEqual(["replaced", "open"]);
  });
});

describe("delete_chat", () => {
  it("deletes the chat with its messages and drafts; events made from its draft and other chats stay", async () => {
    const alice = await app.signedInAs("alice@example.com");
    app.assistant.answerJson({ ...A5_ANSWER, events: A5_ANSWER.events.slice(0, 1) });
    const planned = await sendOk({ text: "Plan Tuesday", chatId: "new" });
    const [draft] = await draftsOf(app.db, alice);
    expect((await acceptDraft(postJson(`/api/chat/drafts/${draft.id}/accept`, {}), app.deps, draft.id)).status).toBe(201);
    const kept = await sendOk({ text: "Keep me", chatId: "new" });

    expect(await read(await remove(planned.chat.id))).toEqual({ status: 200, body: { message: "Chat deleted.", chatId: planned.chat.id } });

    expect(await chatsOf(alice)).toEqual([{ id: kept.chat.id, title: "Keep me" }]);
    expect((await chatOf(app.db, alice)).map((m) => m.text)).toEqual(["Keep me", "Okay."]);
    expect(await draftsOf(app.db, alice)).toEqual([]);
    expect((await eventsOf(app.db, alice)).map((e) => e.title)).toEqual(["Study"]);
  });

  it("another user's chat or one already deleted: 'This chat no longer exists', nothing changed", async () => {
    await app.signedInAs("bob@example.com");
    const bobs = await sendOk({ text: "Bob's plan", chatId: "new" });
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    for (const id of [bobs.chat.id, "7f1d5c3e-1a2b-4c3d-8e9f-0a1b2c3d4e5f", "nope"]) {
      expect(await read(await remove(id))).toEqual({ status: 404, body: { error: "chat_gone", message: "This chat no longer exists" } });
    }
    expect(await app.snapshot()).toEqual(before);
  });

  it("answers 401 without a session and 403 from another site; nothing deleted", async () => {
    expect(await read(await remove("7f1d5c3e-1a2b-4c3d-8e9f-0a1b2c3d4e5f"))).toEqual({
      status: 401,
      body: { error: "unauthorized", message: "Please sign in." },
    });
    await app.signedInAs("alice@example.com");
    const chat = await sendOk({ text: "Mine", chatId: "new" });
    expect((await remove(chat.chat.id, { origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect(await app.db.admin("select id from app.chats")).toEqual([{ id: chat.chat.id }]);
  });
});

describe("the coach's page and chats", () => {
  it("lists the chats newest first and shows the latest one by default", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const older = await sendOk({ text: "Older", chatId: "new" });
    const newer = await sendOk({ text: "Newer", chatId: "new" });

    const page = await loadChatPage(app.deps, alice);
    expect(page.chats.map((c) => c.title)).toEqual(["Newer", "Older"]);
    expect(page.chatId).toBe(newer.chat.id);
    expect(page.messages.map((m) => m.text)).toEqual(["Newer", "Okay."]);

    const asked = await loadChatPage(app.deps, alice, { id: older.chat.id });
    expect(asked.chatId).toBe(older.chat.id);
    expect(asked.messages.map((m) => m.text)).toEqual(["Older", "Okay."]);
  });

  it("'new', another user's chat or an unknown id: an empty new chat, with the user's list", async () => {
    const bob = await app.signedInAs("bob@example.com");
    await seedDraft(app.db, bob, A5_PROPOSALS);
    const [bobs] = await chatsOf(bob);
    const alice = await app.signedInAs("alice@example.com");
    await sendOk({ text: "Mine", chatId: "new" });

    for (const choice of ["new", { id: bobs.id }, { id: "7f1d5c3e-1a2b-4c3d-8e9f-0a1b2c3d4e5f" }, { id: "nope" }] as const) {
      const page = await loadChatPage(app.deps, alice, choice);
      expect(page.chatId, JSON.stringify(choice)).toBeNull();
      expect(page.messages).toEqual([]);
      expect(page.draftDays).toEqual([]);
      expect(page.chats.map((c) => c.title)).toEqual(["Mine"]);
    }
  });
});
