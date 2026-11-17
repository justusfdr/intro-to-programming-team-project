// The coach's page loader (spec 19): one read transaction, the messages with their drafts, the events
// of the days the open draft touches, the goals with their look, whether the chat is allowed and
// whether Claude is set up. Nothing is changed. Spec 44: the chats for the list, the chat shown (the
// latest by default), and no messages-left counter any more.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, type TestApp } from "@test/support/app";
import { A5_PROPOSALS, seedDraft, setPlan } from "@test/support/chat";
import { countingWithUser, heldBack } from "@test/support/counting";
import { seedAllDay, seedEvent } from "@test/support/events";
import { seedGoal } from "@test/support/goals";
import { loadChatPage } from "./load";

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

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("loadChatPage", () => {
  it("an empty chat: no chats, no messages, allowed, Claude set up (the fake)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    expect(await loadChatPage(app.deps, alice)).toEqual({
      display: { timeFormat: "12h", dayStartHour: 7, dayEndHour: 21 },
      timeZone: "Europe/Lisbon",
      chats: [],
      chatId: null,
      now: "2026-11-16T09:00:00.000Z",
      messages: [],
      draftDayEvents: [],
      draftDays: [],
      goals: [],
      chatAllowed: true,
      assistantConfigured: true,
    });
  });

  it("the messages with their drafts, the open draft's days and the events on them, the goals with their look", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const goal = await seedGoal(app.db, alice, { title: "Statistics exam", deadline: "2027-01-20", rules: [{ kind: "hours", target: 6 }] });
    await seedDraft(app.db, alice, A5_PROPOSALS.slice(0, 1), "rejected");
    await seedDraft(app.db, alice, [{ ...A5_PROPOSALS[0], goalId: goal.id }, { title: "Late", start: "2026-11-19T22:00:00.000Z", end: "2026-11-20T01:00:00.000Z" }]);
    await seedEvent(app.db, alice, { title: "Lecture", start: "2026-11-17T15:00:00Z", end: "2026-11-17T16:00:00Z" });
    await seedEvent(app.db, alice, { title: "Wednesday", start: "2026-11-18T15:00:00Z", end: "2026-11-18T16:00:00Z" });
    await seedEvent(app.db, alice, { title: "Friday", start: "2026-11-20T08:00:00Z", end: "2026-11-20T09:00:00Z" });
    await seedAllDay(app.db, alice, { title: "Exam week", firstDay: "2026-11-16", lastDay: "2026-11-17" });

    const page = await loadChatPage(app.deps, alice);

    expect(page.messages.map((m) => [m.role, m.draft?.status ?? null])).toEqual([
      ["user", null],
      ["assistant", "rejected"],
      ["user", null],
      ["assistant", "open"],
    ]);
    expect(page.messages[3].draft!.events[0]).toEqual({
      title: "Study",
      startAt: "2026-11-17T08:00:00.000Z",
      endAt: "2026-11-17T13:00:00.000Z",
      goalId: goal.id,
    });
    // Tuesday, and Thursday into Friday (the late event); not Wednesday.
    expect(page.draftDays).toEqual(["2026-11-17", "2026-11-19", "2026-11-20"]);
    expect(page.draftDayEvents.map((e) => e.title)).toEqual(["Exam week", "Lecture", "Friday"]);
    expect(page.goals).toEqual([{ id: goal.id, title: "Statistics exam", look: { color: "rose", icon: "rocket" } }]);
  });

  it("says whether the chat is allowed (Pro only both ways) and whether Claude is set up", async () => {
    const alice = await app.signedInAs("alice@example.com");
    vi.stubEnv("CHAT_PRO_ONLY", "true");
    expect((await loadChatPage(app.deps, alice)).chatAllowed).toBe(false);
    await setPlan(app.db, alice, "pro");
    expect((await loadChatPage(app.deps, alice)).chatAllowed).toBe(true);
    expect((await loadChatPage({ ...app.deps, assistant: null }, alice)).assistantConfigured).toBe(false);
  });

  it("shows only the user's own chat", async () => {
    const bob = await app.signedInAs("bob@example.com");
    await seedDraft(app.db, bob, A5_PROPOSALS);
    const alice = await app.signedInAs("alice@example.com");
    const page = await loadChatPage(app.deps, alice);
    expect(page.messages).toEqual([]);
    expect(page.draftDays).toEqual([]);
  });

  it("reads in one transaction, changes nothing, and sends the reads without parameters first", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedDraft(app.db, alice, A5_PROPOSALS);
    const { withUser, transactions } = countingWithUser(app.db);
    const before = await app.snapshot();
    await loadChatPage({ withUser, assistant: app.deps.assistant }, alice);
    expect(transactions).toHaveLength(1);
    for (const sent of transactions) expect(heldBack(sent)).toEqual([]);
    expect(await app.snapshot()).toEqual(before);
  });
});
