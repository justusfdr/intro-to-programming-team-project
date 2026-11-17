// Spec 44: searching the coach's chats. Finds the user's own chats by words in their messages or title,
// ignoring case, every word needed, % and _ as typed; newest first with an excerpt and the message to
// jump to; never another user's chat; an empty search finds nothing, a long one is refused.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { searchChats } from "./search-chats";
import { sendMessage } from "./send-message";

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.reset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const search = (q: string, headers: Record<string, string> = {}) =>
  searchChats(
    new Request(`http://localhost:3000/api/chat/search?q=${encodeURIComponent(q)}`, {
      headers: { host: "localhost:3000", "sec-fetch-site": "same-origin", ...headers },
    }),
    app.deps,
  );

type Found = { chat: { id: string; title: string }; messageId: string | null; excerpt: string | null }[];

async function found(q: string): Promise<Found> {
  const answer = await read(await search(q));
  expect(answer.status).toBe(200);
  return answer.body.results as Found;
}

/** A new chat with the user's message and the fake coach's answer. */
async function chat(text: string, answer = "Okay."): Promise<{ id: string; messageIds: string[] }> {
  app.assistant.answerJson({ kind: "text", text: answer, events: [] });
  const sent = await read(await sendMessage(postJson("/api/chat/messages", { text, chatId: "new" }), app.deps));
  const body = sent.body as { chat: { id: string }; messages: { id: string }[] };
  return { id: body.chat.id, messageIds: body.messages.map((m) => m.id) };
}

describe("search_chats", () => {
  it("finds chats by a word in any message, ignoring case, newest first, with the message to jump to", async () => {
    await app.signedInAs("alice@example.com");
    const gym = await chat("Plan the gym into my week", "I put the GYM on Monday and Thursday evening.");
    const study = await chat("Study plan for the exam");
    const later = await chat("Football on Saturday", "Before that, a short gym session?");

    const results = await found("Gym");
    expect(results.map((r) => r.chat.id)).toEqual([later.id, gym.id]);
    expect(results[1]).toMatchObject({ messageId: gym.messageIds[0], excerpt: "Plan the gym into my week" });
    expect(results[0]).toMatchObject({ messageId: later.messageIds[1], excerpt: "Before that, a short gym session?" });
    expect((await found("exam")).map((r) => r.chat.id)).toEqual([study.id]);
  });

  it("needs every word, in one message", async () => {
    await app.signedInAs("alice@example.com");
    const both = await chat("Gym on Friday");
    await chat("Gym on Monday", "Friday is free too.");
    expect((await found("friday gym")).map((r) => r.chat.id)).toEqual([both.id]);
  });

  it("searches % and _ as typed, not as wildcards", async () => {
    await app.signedInAs("alice@example.com");
    const percent = await chat("Raise the budget by 50% next week");
    await chat("Raise the budget by 500 next week");
    expect((await found("50%")).map((r) => r.chat.id)).toEqual([percent.id]);
    expect(await found("_")).toEqual([]);
  });

  it("never finds another user's chats", async () => {
    await app.signedInAs("bob@example.com");
    await chat("Bob's secret gym plan");
    await app.signedInAs("alice@example.com");
    expect(await found("gym")).toEqual([]);
  });

  it("an empty search finds nothing; one over 100 characters is refused", async () => {
    await app.signedInAs("alice@example.com");
    await chat("Anything");
    expect(await found("   ")).toEqual([]);
    expect(await read(await search("x".repeat(101)))).toEqual({
      status: 400,
      body: { error: "search_length", message: "A search can be at most 100 characters" },
    });
  });

  it("changes nothing; 401 without a session and 403 from another site", async () => {
    expect((await search("gym")).status).toBe(401);
    await app.signedInAs("alice@example.com");
    await chat("Gym");
    const before = await app.snapshot();
    await found("gym");
    expect(await app.snapshot()).toEqual(before);
    expect((await search("gym", { origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status).toBe(403);
  });
});
