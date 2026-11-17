// Tests for supabase/migrations/*_coach_chats.sql (spec 44): chats belong to their user (R3), what a
// user may write, a message goes into a chat of the same user only, a message saved without a chat
// (the main branch's builds) goes into the latest chat or a new one, each message moves its chat's
// time on, deleting a chat deletes its messages and drafts but no event, deleting the account deletes
// the chats, and the messages saved before the migration become one chat per user and day.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedEvent } from "@test/support/events";
import { createTestDb, type TestDb } from "./harness";

let db: TestDb;
let alice: string;
let bob: string;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.admin("delete from auth.users");
  alice = await db.createUser("alice@example.com", { confirmed: true });
  bob = await db.createUser("bob@example.com", { confirmed: true });
});

const startChat = (userId: string, title = "Plan my week") =>
  db.withUser(userId, async (q) => (await q<{ id: string }>("insert into app.chats (title) values ($1) returning id", [title]))[0].id);

const say = (userId: string, chatId: string | null, text: string, role = "user") =>
  db.withUser(userId, async (q) =>
    chatId === null
      ? (await q<{ id: string; chat_id: string }>("insert into app.chat_messages (role, text) values ($1, $2) returning id, chat_id", [role, text]))[0]
      : (
          await q<{ id: string; chat_id: string }>(
            "insert into app.chat_messages (chat_id, role, text) values ($1, $2, $3) returning id, chat_id",
            [chatId, role, text],
          )
        )[0],
  );

const chatsOf = (userId: string) =>
  db.admin<{ id: string; title: string; created_at: string; updated_at: string }>(
    "select id, title, created_at::text, updated_at::text from app.chats where user_id = $1 order by created_at, id",
    [userId],
  );

describe("chats belong to their user (R3)", () => {
  it("lets a user start a chat; the database fills in owner and times", async () => {
    const id = await startChat(alice);
    const [row] = await db.admin<{ user_id: string; title: string }>("select user_id, title from app.chats where id = $1", [id]);
    expect(row).toEqual({ user_id: alice, title: "Plan my week" });
  });

  it("hides another user's chats and messages, and a user cannot delete them", async () => {
    const id = await startChat(alice);
    await say(alice, id, "Hello");
    expect(await db.withUser(bob, (q) => q("select * from app.chats"))).toEqual([]);
    expect(await db.withUser(bob, (q) => q("select * from app.chat_messages"))).toEqual([]);
    expect(await db.withUser(bob, (q) => q("delete from app.chats where id = $1 returning id", [id]))).toEqual([]);
    expect(await chatsOf(alice)).toHaveLength(1);
  });

  it("does not let a user put a message into another user's chat", async () => {
    const id = await startChat(alice);
    await expect(say(bob, id, "Sneaky")).rejects.toThrow(/chat_messages_chat_of_same_user/);
    expect(await db.admin("select * from app.chat_messages")).toEqual([]);
  });

  it("lets a user write only the title: not the owner, not the times, and no change afterwards", async () => {
    await expect(
      db.withUser(alice, (q) => q("insert into app.chats (user_id, title) values ($1, 'Mine')", [bob])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.withUser(alice, (q) => q("insert into app.chats (title, updated_at) values ('Mine', now() + interval '1 day')")),
    ).rejects.toThrow(/permission denied/);
    const id = await startChat(alice);
    await expect(db.withUser(alice, (q) => q("update app.chats set title = 'Other' where id = $1", [id]))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("checks the title: 1 to 80 characters", async () => {
    await expect(startChat(alice, "")).rejects.toThrow(/chats_title_length/);
    await expect(startChat(alice, "x".repeat(81))).rejects.toThrow(/chats_title_length/);
    await expect(startChat(alice, "x".repeat(80))).resolves.toBeTruthy();
  });
});

describe("every message has a chat", () => {
  it("a message without a chat goes into the user's latest chat", async () => {
    const older = await startChat(alice, "Older");
    await say(alice, older, "First");
    const newer = await startChat(alice, "Newer");
    await say(alice, newer, "Second");
    expect((await say(alice, null, "From an old build")).chat_id).toBe(newer);
  });

  it("a message without a chat starts one, titled with it, when the user has none", async () => {
    const { chat_id } = await say(alice, null, "  Plan my\nSaturday  ");
    expect((await chatsOf(alice)).map((c) => [c.id, c.title])).toEqual([[chat_id, "Plan my Saturday"]]);
  });

  it("each message moves its chat's time on", async () => {
    const id = await startChat(alice);
    await db.admin("update app.chats set updated_at = '2026-11-01T10:00:00Z' where id = $1", [id]);
    await say(alice, id, "Hello");
    const [chat] = await db.admin<{ moved: boolean }>("select updated_at > '2026-11-02'::timestamptz as moved from app.chats where id = $1", [id]);
    expect(chat.moved).toBe(true);
  });
});

describe("deleting", () => {
  it("deleting a chat deletes its messages and their drafts; events and other chats stay", async () => {
    const id = await startChat(alice);
    await say(alice, id, "Plan tomorrow");
    const { id: answer } = await say(alice, id, "Here is a plan", "assistant");
    await db.withUser(alice, (q) =>
      q("insert into app.draft_plans (message_id, proposed_events) values ($1, $2::jsonb)", [
        answer,
        JSON.stringify([{ title: "Study", start_at: "2026-12-01T08:00:00Z", end_at: "2026-12-01T10:00:00Z", goal_id: null }]),
      ]),
    );
    const other = await startChat(alice, "Other");
    await say(alice, other, "Keep me");
    await seedEvent(db, alice, { title: "Lecture", start: "2026-12-01T12:00:00Z", end: "2026-12-01T13:00:00Z" });

    await db.withUser(alice, (q) => q("delete from app.chats where id = $1", [id]));

    expect((await db.admin<{ text: string }>("select text from app.chat_messages")).map((m) => m.text)).toEqual(["Keep me"]);
    expect(await db.admin("select * from app.draft_plans")).toEqual([]);
    expect(await db.admin("select title from app.events")).toEqual([{ title: "Lecture" }]);
  });

  it("a chat whose last message is deleted goes too (the main branch's 'Clear chat'); one with messages left stays", async () => {
    const emptied = await startChat(alice, "Emptied");
    await say(alice, emptied, "One");
    await say(alice, emptied, "Two", "assistant");
    const kept = await startChat(alice, "Kept");
    await say(alice, kept, "Three");
    const { id: four } = await say(alice, kept, "Four");

    await db.withUser(alice, (q) => q("delete from app.chat_messages where chat_id = $1", [emptied]));
    await db.withUser(alice, (q) => q("delete from app.chat_messages where id = $1", [four]));

    expect((await chatsOf(alice)).map((c) => c.title)).toEqual(["Kept"]);
    // Bob's chats are not touched by Alice's deletes.
    await say(bob, null, "Bob's");
    await db.withUser(alice, (q) => q("delete from app.chat_messages"));
    expect(await chatsOf(alice)).toEqual([]);
    expect((await chatsOf(bob)).map((c) => c.title)).toEqual(["Bob's"]);
  });

  it("deleting the account deletes the chats", async () => {
    await say(alice, await startChat(alice), "Hello");
    await db.admin("delete from auth.users where id = $1", [alice]);
    expect(await db.admin("select * from app.chats")).toEqual([]);
    expect(await db.admin("select * from app.chat_messages")).toEqual([]);
  });
});

describe("messages saved before chats existed", () => {
  it("become one chat per user and day in the user's time zone, titled with that day's first user message", async () => {
    const before = await createTestDb({ stopBefore: "20261215000000_coach_chats.sql" });
    try {
      const ana = await before.createUser("ana@example.com", { confirmed: true, timeZone: "Europe/Lisbon" });
      const ben = await before.createUser("ben@example.com", { confirmed: true, timeZone: "Europe/Lisbon" });
      const add = (userId: string, role: string, text: string, at: string) =>
        before.admin("insert into app.chat_messages (user_id, role, text, created_at) values ($1, $2, $3, $4)", [userId, role, text, at]);
      await add(ana, "user", "Plan Monday", "2026-11-16T09:00:00Z");
      await add(ana, "assistant", "Here is Monday.", "2026-11-16T09:00:05Z");
      await add(ana, "user", "And the evening?", "2026-11-16T18:00:00Z");
      await add(ana, "assistant", "Done.", "2026-11-16T18:00:05Z");
      await add(ana, "user", "Plan Tuesday", "2026-11-17T08:00:00Z");
      await add(ana, "assistant", "Here is Tuesday.", "2026-11-17T08:00:05Z");
      await add(ben, "user", "Hi", "2026-11-17T10:00:00Z");
      await add(ben, "assistant", "Hello.", "2026-11-17T10:00:05Z");

      await before.migrateRest();

      const chats = await before.admin<{ user_id: string; title: string; created_at: string; updated_at: string; messages: number }>(
        `select c.user_id, c.title, to_char(c.created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') as created_at,
                to_char(c.updated_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') as updated_at,
                (select count(*)::int from app.chat_messages m where m.chat_id = c.id) as messages
           from app.chats c order by c.created_at`,
      );
      expect(chats).toEqual([
        { user_id: ana, title: "Plan Monday", created_at: "2026-11-16 09:00:00", updated_at: "2026-11-16 18:00:05", messages: 4 },
        { user_id: ana, title: "Plan Tuesday", created_at: "2026-11-17 08:00:00", updated_at: "2026-11-17 08:00:05", messages: 2 },
        { user_id: ben, title: "Hi", created_at: "2026-11-17 10:00:00", updated_at: "2026-11-17 10:00:05", messages: 2 },
      ]);
      expect(await before.admin("select * from app.chat_messages where chat_id is null")).toEqual([]);
    } finally {
      await before.close();
    }
  });
});
