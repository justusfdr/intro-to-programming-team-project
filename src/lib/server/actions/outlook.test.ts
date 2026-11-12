// Tests for spec 08 through the actions: connect_outlook (sign-in with PKCE and state), sync_outlook,
// sending app events, disconnect_outlook and R11 — against the fake Outlook, never Microsoft.
// The clock starts on Monday 16 November 2026 at 09:00 UTC; Lisbon is UTC then.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, OUTLOOK_TEST_KEY, OWN_ORIGIN, postJson, read, type TestApp } from "@test/support/app";
import { eventListOf, seedAllDay, seedEvent } from "@test/support/events";
import { seedGoal } from "@test/support/goals";
import { loadWeek } from "@/lib/server/events/week";
import { open, tokenPurpose } from "@/lib/server/outlook/box";
import type { OutlookEvent } from "@/lib/server/outlook/types";
import { createEvent } from "./create-event";
import { deleteEvent } from "./delete-event";
import { editEvent } from "./edit-event";
import { markEventDone } from "./event-status";
import { disconnectOutlook, sendOutlookNow, syncOutlookNow } from "./outlook";
import { finishOutlookSignIn, startOutlookSignIn } from "./outlook-connect";

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

const LECTURE: OutlookEvent = {
  outlookId: "AAMk-lecture",
  title: "Statistics lecture",
  allDay: false,
  startAt: "2026-11-17T09:00:00.000Z",
  endAt: "2026-11-17T10:30:00.000Z",
  firstDay: null,
  lastDay: null,
  location: "Nova SBE, Carcavelos",
  transactionId: null,
};
const HOLIDAY: OutlookEvent = { ...LECTURE, outlookId: "AAMk-holiday", title: "Holiday", allDay: true, startAt: null, endAt: null, firstDay: "2026-11-20", lastDay: "2026-11-22", location: null };

/** The value of the sign-in cookie that an answer sets, and its whole Set-Cookie header. */
function signInCookie(response: Response): { value: string; header: string } {
  const header = response.headers.get("set-cookie") ?? "";
  return { value: /^outlook_sign_in=([^;]*)/.exec(header)?.[1] ?? "", header };
}

function callback(params: Record<string, string>, cookie: string | null): Request {
  return new Request(`${OWN_ORIGIN}/api/outlook/callback?${new URLSearchParams(params)}`, {
    headers: { host: "localhost:3000", "sec-fetch-site": "cross-site", ...(cookie ? { cookie: `outlook_sign_in=${cookie}` } : {}) },
  });
}

const start = () => startOutlookSignIn(postJson("/api/outlook/connect", {}), app.deps, app.outlookDeps);

/** Starts the sign-in; returns the code Microsoft would send back, the state and the cookie. */
async function begin(events: OutlookEvent[] = []) {
  const code = app.outlook.account(events);
  const answer = await start();
  const state = new URL(answer.headers.get("location")!).searchParams.get("state")!;
  return { code, state, cookie: signInCookie(answer).value, answer };
}

/** Signs in to the app and connects Outlook with these events in it. */
async function connected(email: string, events: OutlookEvent[] = []) {
  const user = await app.signedInAs(email, { timeZone: "Europe/Lisbon" });
  const { code, state, cookie } = await begin(events);
  const answer = await finishOutlookSignIn(callback({ code, state }, cookie), app.deps, app.outlookDeps);
  expect(answer.headers.get("location")).toBe(`${OWN_ORIGIN}/?outlook=connected`);
  return { user, code };
}

const sync = async () => read(await syncOutlookNow(postJson("/api/outlook/sync", {}), app.deps, app.outlookDeps));
/** Lets the next sync run: the last one started more than 5 minutes ago. */
const fiveMinutesLater = () => app.db.admin("update app.calendar_connections set sync_started_at = now() - interval '5 minutes'");
const connection = () => app.db.admin<{ status: string; token_encrypted: string; last_synced_at: Date | null }>("select status, token_encrypted, last_synced_at from app.calendar_connections");

describe("connect_outlook: start", () => {
  it("sends the signed-in user to Microsoft with PKCE S256 and a state, in a short sealed cookie", async () => {
    await app.signedInAs("alice@example.com");
    const { answer, state, cookie } = await begin();
    expect(answer.status).toBe(303);
    const location = new URL(answer.headers.get("location")!);
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const { header } = signInCookie(answer);
    expect(header).toMatch(/; Path=\/api\/outlook; Max-Age=600; HttpOnly; SameSite=Lax$/);
    expect(cookie).toMatch(/^v1\./);
    expect(cookie).not.toContain(state);
  });

  it("refuses another site, sends a signed-out visitor to sign in, and fails when Outlook is not set up", async () => {
    expect((await startOutlookSignIn(postJson("/api/outlook/connect", {}, { origin: "https://evil.example", "sec-fetch-site": "cross-site" }), app.deps, app.outlookDeps)).status).toBe(403);
    expect((await start()).headers.get("location")).toBe(`${OWN_ORIGIN}/sign-in`);
    await app.signedInAs("alice@example.com");
    expect((await startOutlookSignIn(postJson("/api/outlook/connect", {}), app.deps, null)).headers.get("location")).toBe(`${OWN_ORIGIN}/?outlook=failed`);
  });
});

describe("connect_outlook: callback", () => {
  it("saves the refresh token encrypted for this user, clears the cookie and goes to the calendar", async () => {
    const { user } = await connected("alice@example.com");
    const [row] = await connection();
    expect(row.status).toBe("connected");
    expect(row.token_encrypted).not.toContain("refresh-");
    expect(open(row.token_encrypted, tokenPurpose(user), OUTLOOK_TEST_KEY)).toBe("refresh-1");
    expect(open(row.token_encrypted, tokenPurpose("00000000-0000-4000-8000-000000000000"), OUTLOOK_TEST_KEY)).toBeNull();
  });

  it("ignores any address in the request: the browser always goes to the app's own calendar", async () => {
    await app.signedInAs("alice@example.com");
    const { code, state, cookie } = await begin();
    const answer = await finishOutlookSignIn(callback({ code, state, redirect_uri: "https://evil.example", next: "https://evil.example" }, cookie), app.deps, app.outlookDeps);
    expect(answer.headers.get("location")).toBe(`${OWN_ORIGIN}/?outlook=connected`);
  });

  type Case = [string, (s: { code: string; state: string; cookie: string }) => Promise<Request> | Request];
  const cases: Case[] = [
    ["a wrong state", (s) => callback({ code: s.code, state: `${s.state}x` }, s.cookie)],
    ["no state", (s) => callback({ code: s.code }, s.cookie)],
    ["no cookie", (s) => callback({ code: s.code, state: s.state }, null)],
    ["a changed cookie", (s) => callback({ code: s.code, state: s.state }, s.cookie.slice(0, -2) + (s.cookie.endsWith("A") ? "BB" : "AA"))],
    ["Microsoft's 'access_denied' (declined)", (s) => callback({ error: "access_denied", error_description: "AADSTS65004: User declined to consent", state: s.state }, s.cookie)],
    ["an error next to a code", (s) => callback({ code: s.code, error: "access_denied", state: s.state }, s.cookie)],
    ["a code Microsoft refuses", (s) => callback({ code: "code-unknown", state: s.state }, s.cookie)],
    [
      "a cookie older than 10 minutes",
      (s) => {
        app.advance(601_000);
        return callback({ code: s.code, state: s.state }, s.cookie);
      },
    ],
    [
      "a cookie made for another signed-in user",
      async (s) => {
        await app.signedInAs("bob@example.com");
        return callback({ code: s.code, state: s.state }, s.cookie);
      },
    ],
  ];

  it.each(cases)("with %s: 'Outlook was not connected', nothing saved, cookie cleared", async (_case, request) => {
    await app.signedInAs("alice@example.com");
    const started = await begin();
    const before = await app.snapshot();
    const answer = await finishOutlookSignIn(await request(started), app.deps, app.outlookDeps);
    expect(answer.headers.get("location")).toBe(`${OWN_ORIGIN}/?outlook=failed`);
    expect(signInCookie(answer).header).toMatch(/^outlook_sign_in=; Path=\/api\/outlook; Max-Age=0/);
    const tables = (snapshot: Record<string, unknown>) => {
      const all = snapshot.tables as Record<string, unknown>;
      return { connections: all.calendar_connections, events: all.events };
    };
    expect(tables(await app.snapshot())).toEqual(tables(before));
    expect(await connection()).toEqual([]);
  });

  it.each([
    ["only reading granted", "read_only"],
    ["no refresh token", "no_refresh_token"],
  ] as const)("with %s (R26: read and write at once): not connected", async (_case, consent) => {
    await app.signedInAs("alice@example.com");
    const { code, state, cookie } = await begin();
    app.outlook.consent = consent;
    const answer = await finishOutlookSignIn(callback({ code, state }, cookie), app.deps, app.outlookDeps);
    expect(answer.headers.get("location")).toBe(`${OWN_ORIGIN}/?outlook=failed`);
    expect(await connection()).toEqual([]);
  });

  it("when signed out at the callback: not connected", async () => {
    await app.signedInAs("alice@example.com");
    const { code, state, cookie } = await begin();
    await app.auth.signOut();
    const answer = await finishOutlookSignIn(callback({ code, state }, cookie), app.deps, app.outlookDeps);
    expect(answer.headers.get("location")).toBe(`${OWN_ORIGIN}/?outlook=failed`);
    expect(await connection()).toEqual([]);
  });

  it("a reused callback (the cookie was cleared by the browser) does nothing", async () => {
    await app.signedInAs("alice@example.com");
    const { code, state } = await begin();
    expect((await finishOutlookSignIn(callback({ code, state }, null), app.deps, app.outlookDeps)).headers.get("location")).toContain("failed");
  });
});

describe("sync_outlook (R26)", () => {
  it("imports Outlook's events and sends the app's events that have not ended, in one sync", async () => {
    const { user, code } = await connected("alice@example.com", [LECTURE, HOLIDAY]);
    await seedEvent(app.db, user, { title: "Revision", start: "2026-11-18T09:00:00Z", end: "2026-11-18T11:00:00Z" });
    await seedEvent(app.db, user, { title: "Yesterday's run", start: "2026-11-15T07:00:00Z", end: "2026-11-15T08:00:00Z" });
    await seedAllDay(app.db, user, { title: "Exam week", firstDay: "2026-11-23", lastDay: "2026-11-27" });

    expect(await sync()).toMatchObject({ status: 200, body: { ran: true, ok: true, status: "connected" } });

    const rows = await eventListOf(app.db, user);
    expect(rows.filter((r) => r.title === "Statistics lecture")).toMatchObject([{ start_at: LECTURE.startAt, all_day: false }]);
    expect(rows.filter((r) => r.title === "Holiday")).toMatchObject([{ all_day: true, first_day: "2026-11-20", last_day: "2026-11-22" }]);
    const titles = [...app.outlook.eventsOf(code).values()].map((e) => e.title).sort();
    expect(titles).toEqual(["Exam week", "Holiday", "Revision", "Statistics lecture"]);
    expect(await app.db.admin("select source, location from app.events where outlook_id = 'AAMk-lecture'")).toEqual([{ source: "outlook", location: "Nova SBE, Carcavelos" }]);
    expect((await connection())[0].last_synced_at).not.toBeNull();
    expect(app.outlook.calls.filter((c) => c.startsWith("list"))).toEqual(["list 2026-11-09T09:00:00.000Z 2027-01-15T09:00:00.000Z"]);
  });

  it("runs at most every 5 minutes", async () => {
    await connected("alice@example.com", [LECTURE]);
    expect((await sync()).body).toMatchObject({ ran: true });
    const calls = app.outlook.calls.length;
    expect((await sync()).body).toMatchObject({ ran: false, status: "connected" });
    expect(app.outlook.calls.length).toBe(calls);
    await fiveMinutesLater();
    expect((await sync()).body).toMatchObject({ ran: true });
  });

  it("follows Outlook: a changed event is updated, a deleted one vanishes, its goal is kept", async () => {
    const { user, code } = await connected("alice@example.com", [LECTURE, HOLIDAY]);
    await sync();
    const goal = await seedGoal(app.db, user, { deadline: "2027-03-14", rules: [{ kind: "count", target: 2 }] });
    await app.db.admin("update app.events set goal_id = $1 where outlook_id = 'AAMk-lecture'", [goal.id]);
    app.outlook.eventsOf(code).set(LECTURE.outlookId, { ...LECTURE, title: "Statistics lecture (room 2)" });
    app.outlook.eventsOf(code).delete(HOLIDAY.outlookId);
    await fiveMinutesLater();
    await sync();
    expect(await app.db.admin("select title, goal_id from app.events where source = 'outlook'")).toEqual([{ title: "Statistics lecture (room 2)", goal_id: goal.id }]);
  });

  it("sends later edits and deletions of app events", async () => {
    const { user, code } = await connected("alice@example.com");
    const kept = await seedEvent(app.db, user, { title: "Revision", start: "2026-11-18T09:00:00Z", end: "2026-11-18T11:00:00Z" });
    const removed = await seedEvent(app.db, user, { title: "Gym", start: "2026-11-19T18:00:00Z", end: "2026-11-19T19:00:00Z" });
    await sync();
    const [fresh] = (await eventListOf(app.db, user)).filter((e) => e.id === kept.id);
    await editEvent(postJson(`/api/events/${kept.id}/edit`, { title: "Revision (library)", start: "2026-11-18T10:00", end: "2026-11-18T12:00", updatedAt: fresh.updated_at }), app.deps, kept.id);
    const [gym] = (await eventListOf(app.db, user)).filter((e) => e.id === removed.id);
    await deleteEvent(postJson(`/api/events/${removed.id}/delete`, { updatedAt: gym.updated_at }), app.deps, removed.id);

    expect(await read(await sendOutlookNow(postJson("/api/outlook/send", {}), app.deps, app.outlookDeps))).toEqual({ status: 200, body: { sent: 2 } });
    const inOutlook = [...app.outlook.eventsOf(code).values()];
    expect(inOutlook).toMatchObject([{ title: "Revision (library)", startAt: "2026-11-18T10:00:00.000Z" }]);
    expect(await app.db.admin("select count(*)::int as n from app.outlook_deletions")).toEqual([{ n: 0 }]);
  });

  it("does not move updated_at when it records a sent event, so an open editor can still save (R4)", async () => {
    const { user } = await connected("alice@example.com");
    const e = await seedEvent(app.db, user, { title: "Revision", start: "2026-11-18T09:00:00Z", end: "2026-11-18T11:00:00Z" });
    await sync();
    const edited = await editEvent(postJson(`/api/events/${e.id}/edit`, { title: "Revision 2", start: "2026-11-18T09:00", end: "2026-11-18T11:00", updatedAt: e.updatedAt }), app.deps, e.id);
    expect(edited.status).toBe(200);
  });

  it("Outlook down: imported events stay, unsent events are marked 'Not sent to Outlook' and go at the next sync", async () => {
    const { user, code } = await connected("alice@example.com", [LECTURE]);
    await sync();
    await seedEvent(app.db, user, { title: "Revision", start: "2026-11-18T09:00:00Z", end: "2026-11-18T11:00:00Z" });
    app.outlook.down = true;
    await fiveMinutesLater();
    expect((await sync()).body).toMatchObject({ ran: true, ok: false, status: "connected" });
    const week = await loadWeek(app.deps, user, "2026-11-16");
    const shown = week.days.flatMap((d) => d.events);
    expect(shown.map((e) => [e.title, e.source, e.notSent])).toEqual([
      ["Statistics lecture", "outlook", false],
      ["Revision", "app", true],
    ]);
    app.outlook.down = false;
    await fiveMinutesLater();
    await sync();
    expect([...app.outlook.eventsOf(code).values()].map((e) => e.title).sort()).toEqual(["Revision", "Statistics lecture"]);
    expect((await loadWeek(app.deps, user, "2026-11-16")).days.flatMap((d) => d.events).every((e) => !e.notSent)).toBe(true);
  });

  it("throttling: only the throttled event waits", async () => {
    const { user, code } = await connected("alice@example.com");
    const a = await seedEvent(app.db, user, { title: "A", start: "2026-11-18T09:00:00Z", end: "2026-11-18T10:00:00Z" });
    await seedEvent(app.db, user, { title: "B", start: "2026-11-18T11:00:00Z", end: "2026-11-18T12:00:00Z" });
    app.outlook.throttled = new Set([a.id]);
    await sync();
    expect([...app.outlook.eventsOf(code).values()].map((e) => e.title)).toEqual(["B"]);
    app.outlook.throttled = new Set();
    await sendOutlookNow(postJson("/api/outlook/send", {}), app.deps, app.outlookDeps);
    expect([...app.outlook.eventsOf(code).values()].map((e) => e.title).sort()).toEqual(["A", "B"]);
  });

  it("sends in batches of 20, at most 100 per run", async () => {
    const { user, code } = await connected("alice@example.com");
    for (let i = 0; i < 120; i++) {
      const start = new Date(Date.parse("2026-11-17T00:00:00Z") + i * 60 * 60 * 1000);
      await seedEvent(app.db, user, { title: `E${i}`, start: start.toISOString(), end: new Date(start.getTime() + 30 * 60 * 1000).toISOString() });
    }
    await sync();
    expect(app.outlook.calls.filter((c) => c.startsWith("batch"))).toEqual(["batch 20", "batch 20", "batch 20", "batch 20", "batch 20"]);
    expect(app.outlook.eventsOf(code).size).toBe(100);
    await sendOutlookNow(postJson("/api/outlook/send", {}), app.deps, app.outlookDeps);
    expect(app.outlook.eventsOf(code).size).toBe(120);
  });

  it("Microsoft refuses the stored access: needs_reconnect, nothing else changes", async () => {
    const { user } = await connected("alice@example.com", [LECTURE]);
    await sync();
    app.outlook.refusing = true;
    await fiveMinutesLater();
    expect((await sync()).body).toMatchObject({ ran: true, ok: false, status: "needs_reconnect" });
    expect((await loadWeek(app.deps, user, "2026-11-16")).outlook.status).toBe("needs_reconnect");
    expect(await app.db.admin("select title from app.events where source = 'outlook'")).toEqual([{ title: "Statistics lecture" }]);
    // Reconnecting brings it back.
    app.outlook.refusing = false;
    const { code, state, cookie } = await begin([LECTURE]);
    await finishOutlookSignIn(callback({ code, state }, cookie), app.deps, app.outlookDeps);
    expect((await connection())[0].status).toBe("connected");
  });

  it("saves the new refresh token Microsoft sends, still encrypted", async () => {
    const { user } = await connected("alice@example.com");
    await sync();
    expect(open((await connection())[0].token_encrypted, tokenPurpose(user), OUTLOOK_TEST_KEY)).toBe("refresh-1+");
  });

  it("never touches another user's events", async () => {
    const bob = await connected("bob@example.com", [LECTURE]);
    await sync();
    const bobBefore = await eventListOf(app.db, bob.user);
    await connected("alice@example.com", []);
    await sync();
    expect(await eventListOf(app.db, bob.user)).toEqual(bobBefore);
  });

  it("without a connection: nothing runs, and no event is marked 'Not sent to Outlook'", async () => {
    const user = await app.signedInAs("alice@example.com");
    await seedEvent(app.db, user, { title: "Revision", start: "2026-11-18T09:00:00Z", end: "2026-11-18T11:00:00Z" });
    expect((await loadWeek(app.deps, user, "2026-11-16")).days.flatMap((d) => d.events).map((e) => e.notSent)).toEqual([false]);
    expect((await sync()).body).toMatchObject({ ran: false, status: "none" });
    expect(await read(await sendOutlookNow(postJson("/api/outlook/send", {}), app.deps, app.outlookDeps))).toEqual({ status: 200, body: { sent: 0 } });
    expect(app.outlook.calls).toEqual([]);
  });
});

describe("disconnect_outlook (R26)", () => {
  it("deletes the connection and imported events; app events stay here and in Outlook", async () => {
    const { user, code } = await connected("alice@example.com", [LECTURE]);
    await seedEvent(app.db, user, { title: "Revision", start: "2026-11-18T09:00:00Z", end: "2026-11-18T11:00:00Z" });
    await sync();
    expect(await read(await disconnectOutlook(postJson("/api/outlook/disconnect", {}), app.deps))).toEqual({ status: 200, body: { message: "Outlook disconnected." } });
    expect((await eventListOf(app.db, user)).map((e) => e.title)).toEqual(["Revision"]);
    expect(await connection()).toEqual([]);
    expect([...app.outlook.eventsOf(code).values()].map((e) => e.title).sort()).toEqual(["Revision", "Statistics lecture"]);
    expect((await loadWeek(app.deps, user, "2026-11-16")).outlook).toEqual({ status: "none", lastSyncedAt: null });
  });

  it("refuses another site", async () => {
    await connected("alice@example.com");
    const answer = await disconnectOutlook(postJson("/api/outlook/disconnect", {}, { origin: "https://evil.example", "sec-fetch-site": "cross-site" }), app.deps);
    expect(answer.status).toBe(403);
    expect(await connection()).toHaveLength(1);
  });
});

describe("R11: Outlook events keep title, times and days", () => {
  async function imported() {
    const { user } = await connected("alice@example.com", [LECTURE]);
    await sync();
    const [row] = await eventListOf(app.db, user); // the imported lecture is the only event
    return { user, row };
  }

  it.each([
    ["a new title", { title: "Renamed" }],
    ["new times", { start: "2026-11-17T10:00", end: "2026-11-17T11:00" }],
    ["all day", { allDay: true, firstDay: "2026-11-17", lastDay: "2026-11-17" }],
    ["may overlap", { mayOverlap: true }],
  ])("refuses %s: 409 'Change this event in Outlook'; nothing changes", async (_case, change) => {
    const { row } = await imported();
    const before = await app.snapshot();
    const answer = await read(await editEvent(postJson(`/api/events/${row.id}/edit`, { ...change, updatedAt: row.updated_at }), app.deps, row.id));
    expect(answer).toMatchObject({ status: 409, body: { message: "Change this event in Outlook" } });
    expect(await app.snapshot()).toEqual(before);
  });

  it("refuses a delete: 409 'Change this event in Outlook'", async () => {
    const { row } = await imported();
    const answer = await read(await deleteEvent(postJson(`/api/events/${row.id}/delete`, { updatedAt: row.updated_at }), app.deps, row.id));
    expect(answer).toMatchObject({ status: 409, body: { message: "Change this event in Outlook" } });
  });

  it("lets the user set the goal and mark it done once it has started", async () => {
    const { user, row } = await imported();
    const goal = await seedGoal(app.db, user, { deadline: "2027-03-14", rules: [{ kind: "count", target: 2 }] });
    const answer = await read(await editEvent(postJson(`/api/events/${row.id}/edit`, { goalId: goal.id, updatedAt: row.updated_at }), app.deps, row.id));
    expect(answer).toMatchObject({ status: 200, body: { message: "Event saved.", event: { goalId: goal.id, source: "outlook", title: "Statistics lecture" } } });
    app.advance(25 * 60 * 60 * 1000);
    expect((await markEventDone(postJson(`/api/events/${row.id}/done`, {}), app.deps, row.id)).status).toBe(200);
  });

  it("an all-day Outlook event takes no goal", async () => {
    const { user } = await connected("alice@example.com", [HOLIDAY]);
    await sync();
    const [row] = await eventListOf(app.db, user);
    const goal = await seedGoal(app.db, user, { deadline: "2027-03-14", rules: [{ kind: "count", target: 2 }] });
    const answer = await read(await editEvent(postJson(`/api/events/${row.id}/edit`, { goalId: goal.id, updatedAt: row.updated_at }), app.deps, row.id));
    expect(answer).toMatchObject({ status: 400, body: { message: "All-day events have no goal" } });
  });

  it("app events are still edited as before, and a new one is sent right after", async () => {
    const { code } = await connected("alice@example.com");
    await createEvent(postJson("/api/events", { title: "Run", start: "2026-11-18T07:00", end: "2026-11-18T08:00" }), app.deps);
    await sendOutlookNow(postJson("/api/outlook/send", {}), app.deps, app.outlookDeps);
    expect([...app.outlook.eventsOf(code).values()].map((e) => e.title)).toEqual(["Run"]);
  });
});
