// Tests for the demo week and the welcome (spec 13; ontology section 5 load_demo, remove_demo,
// start_fresh, R36): what "Explore the demo" creates, that loading twice is rejected, that removing
// leaves the user's own rows and other accounts alone, that every limit applies to the demo rows, and
// that demo events never go to Outlook. Each rejected case checks the exact answer and that nothing changed.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, OWN_ORIGIN, postJson, read, type TestApp } from "@test/support/app";
import { seedEvent } from "@test/support/events";
import { seedGoal } from "@test/support/goals";
import { seedOpenTasks, seedTask } from "@test/support/tasks";
import { welcomeDue } from "@/lib/server/demo/rows";
import { loadWeek } from "@/lib/server/events/week";
import { loadDemo } from "./load-demo";
import { sendOutlookNow } from "./outlook";
import { finishOutlookSignIn, startOutlookSignIn } from "./outlook-connect";
import { removeDemo } from "./remove-demo";
import { startFresh } from "./start-fresh";

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

const HOUR = 3_600_000;
const load = (headers?: Record<string, string>) => loadDemo(postJson("/api/demo/load", {}, headers), app.deps);
const remove = (headers?: Record<string, string>) => removeDemo(postJson("/api/demo/remove", {}, headers), app.deps);
const fresh = (headers?: Record<string, string>) => startFresh(postJson("/api/welcome/start-fresh", {}, headers), app.deps);

const goalsOf = (userId: string) =>
  app.db.admin(
    `select g.title, g.deadline::text as deadline, g.color, g.icon, g.why, g.demo,
            json_agg(json_build_object('kind', r.kind, 'target', r.target::float, 'min_minutes', r.min_minutes)) as rules
       from app.goals g join app.rules r on r.goal_id = g.id
      where g.user_id = $1 group by g.id order by g.title`,
    [userId],
  );
const tasksOf = (userId: string) =>
  app.db.admin<{ title: string; goal: string | null; due_date: string | null; status: string; demo: boolean }>(
    `select t.title, g.title as goal, t.due_date::text as due_date, t.status, t.demo
       from app.tasks t left join app.goals g on g.id = t.goal_id where t.user_id = $1 order by t.created_at, t.title`,
    [userId],
  );
const eventsOf = (userId: string) =>
  app.db.admin<{ title: string; goal: string | null; start_at: Date; end_at: Date; status: string; demo: boolean; source: string }>(
    `select e.title, g.title as goal, e.start_at, e.end_at, e.status, e.demo, e.source
       from app.events e left join app.goals g on g.id = e.goal_id where e.user_id = $1 order by e.start_at, e.title`,
    [userId],
  );
const welcomeOf = async (userId: string) =>
  (await app.db.admin<{ welcome_answered: boolean }>("select welcome_answered from app.settings where user_id = $1", [userId]))[0].welcome_answered;

describe("load_demo accepted", () => {
  it("creates the prototype's three goals, each with one hours rule and a deadline five weeks from today", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });

    expect(await read(await load())).toEqual({ status: 201, body: { message: "Demo week added." } });

    expect(await goalsOf(alice)).toEqual([
      {
        title: "Grow my YouTube channel",
        deadline: "2026-12-21",
        color: "rose",
        icon: "video",
        why: "Share what I learn and get comfortable on camera.",
        demo: true,
        rules: [{ kind: "hours", target: 6, min_minutes: null }],
      },
      {
        title: "Launch app v2",
        deadline: "2026-12-21",
        color: "indigo",
        icon: "rocket",
        why: "Real users instead of demo data.",
        demo: true,
        rules: [{ kind: "hours", target: 8, min_minutes: null }],
      },
      {
        title: "Run a half marathon under 2h",
        deadline: "2026-12-21",
        color: "teal",
        icon: "footprints",
        why: "Stay fit, even when the semester gets busy.",
        demo: true,
        rules: [{ kind: "hours", target: 4, min_minutes: null }],
      },
    ]);
    expect(await welcomeOf(alice)).toBe(true);
  });

  it("adds the prototype's nine tasks without its habits, due relative to today, two of them done", async () => {
    app.advance(2 * 24 * HOUR + 4 * HOUR); // Wednesday 18 November, 13:00 in Lisbon
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    await load();
    // Added in one transaction, so they share created_at; compared by title.
    const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title);
    expect((await tasksOf(alice)).sort(byTitle)).toEqual(
      [
        { title: "Fix the onboarding bug", goal: "Launch app v2", due_date: "2026-11-18", status: "open" },
        { title: "Cluster beta feedback", goal: "Launch app v2", due_date: null, status: "open" },
        { title: "Write release notes", goal: "Launch app v2", due_date: "2026-11-20", status: "open" },
        { title: "Brainstorm thumbnail ideas", goal: "Grow my YouTube channel", due_date: "2026-11-19", status: "open" },
        { title: "Update channel banner", goal: "Grow my YouTube channel", due_date: null, status: "done" },
        { title: "Buy new running shoes", goal: "Run a half marathon under 2h", due_date: null, status: "open" },
        { title: "Sign up for the half marathon", goal: "Run a half marathon under 2h", due_date: null, status: "done" },
        { title: "Call mom back", goal: null, due_date: "2026-11-22", status: "open" },
        { title: "Renew passport", goal: null, due_date: "2026-11-27", status: "open" },
      ]
        .map((task) => ({ ...task, demo: true }))
        .sort(byTitle),
    );
  });

  it("never sets a due date in the past: on a Saturday the release notes are due today", async () => {
    app.advance(5 * 24 * HOUR); // Saturday 21 November
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    await load();
    const notes = (await tasksOf(alice)).find((t) => t.title === "Write release notes")!;
    expect(notes.due_date).toBe("2026-11-21");
  });

  it("adds the prototype's week of 20 events for this week, linked to their goals, the ended ones done", async () => {
    app.advance(2 * 24 * HOUR + 4 * HOUR); // Wednesday 18 November, 13:00 in Lisbon (UTC in November)
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    await load();
    const events = await eventsOf(alice);

    expect(events).toHaveLength(20);
    expect(events.every((e) => e.demo && e.source === "app")).toBe(true);
    expect(events[0]).toMatchObject({ title: "Easy 5K", goal: "Run a half marathon under 2h", status: "done" });
    expect(new Date(events[0].start_at).toISOString()).toBe("2026-11-16T07:30:00.000Z");
    expect(events.at(-1)).toMatchObject({ title: "Long run 16 km", goal: "Run a half marathon under 2h", status: "planned" });
    expect(new Date(events.at(-1)!.start_at).toISOString()).toBe("2026-11-21T09:00:00.000Z");
    expect(events.filter((e) => e.goal !== null)).toHaveLength(11);
    // Monday and Tuesday (9 events) and Wednesday's "Edit episode 1" have ended and are done. The
    // prototype's skipped "Admin" on Wednesday stays planned; nothing later is done.
    expect(events.filter((e) => e.status === "done").map((e) => e.title)).toEqual([
      "Easy 5K",
      "Script the next video",
      "Review beta interviews",
      "Statistics lecture",
      "Inbox zero",
      "Film + voiceover",
      "Deep work: beta fixes",
      "Lunch with Lea",
      "Intervals 6 × 800 m",
      "Edit episode 1",
    ]);
    expect(events.find((e) => e.title === "Admin" && new Date(e.start_at).getUTCDate() === 18)?.status).toBe("planned");
  });

  it("places the events at their local times in the user's own time zone", async () => {
    const kiri = await app.signedInAs("kiri@example.com", { timeZone: "Pacific/Auckland" });
    await load(); // 09:00 UTC on Monday is 22:00 on Monday in Auckland
    const [first] = await eventsOf(kiri);
    expect(first.title).toBe("Easy 5K");
    expect(new Date(first.start_at).toISOString()).toBe("2026-11-15T18:30:00.000Z"); // Monday 16 November, 07:30 in Auckland
  });

  it("goes next to the user's own rows and changes none of them", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const own = await seedGoal(app.db, alice, { title: "My own goal", deadline: "2027-03-14", rules: [{ kind: "count", target: 2 }] });
    await seedTask(app.db, alice, { title: "My own task" });
    await seedEvent(app.db, alice, { title: "My own event", start: "2026-11-17T10:00:00Z", end: "2026-11-17T11:00:00Z" });
    const before = await app.db.admin("select id, title, demo, updated_at from app.goals where id = $1", [own.id]);

    expect((await load()).status).toBe(201);

    expect(await app.db.admin("select id, title, demo, updated_at from app.goals where id = $1", [own.id])).toEqual(before);
    expect((await tasksOf(alice)).filter((t) => !t.demo).map((t) => t.title)).toEqual(["My own task"]);
    expect((await eventsOf(alice)).filter((e) => !e.demo).map((e) => e.title)).toEqual(["My own event"]);
  });

  it("touches no other account", async () => {
    const bob = await app.signedInAs("bob@example.com");
    await seedTask(app.db, bob, { title: "Bob's task" });
    await app.signedInAs("alice@example.com");
    await load();
    expect(await goalsOf(bob)).toEqual([]);
    expect(await eventsOf(bob)).toEqual([]);
    expect((await tasksOf(bob)).map((t) => t.title)).toEqual(["Bob's task"]);
    expect(await welcomeOf(bob)).toBe(false);
  });
});

describe("load_demo rejected: nothing changes (R1)", () => {
  it("rejects loading twice", async () => {
    await app.signedInAs("alice@example.com");
    await load();
    const before = await app.snapshot();
    expect(await read(await load())).toEqual({ status: 409, body: { error: "demo_loaded", message: "The demo is already loaded" } });
    expect(await app.snapshot()).toEqual(before);
  });

  it("rejects it while even one demo row is left, and accepts it again once the demo is removed", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await load();
    await app.db.admin("delete from app.goals where user_id = $1", [alice]);
    await app.db.admin("delete from app.events where user_id = $1", [alice]);
    await app.db.admin("delete from app.tasks where user_id = $1 and title <> 'Renew passport'", [alice]);
    expect((await read(await load())).body.message).toBe("The demo is already loaded");

    await remove();
    expect((await load()).status).toBe(201);
  });

  it("keeps the limit of 100 open tasks (R32): with 94 open, the demo's 7 do not fit", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedOpenTasks(app.db, alice, 94);
    const before = await app.snapshot();
    expect(await read(await load())).toEqual({ status: 409, body: { error: "too_many_tasks", message: "You can have at most 100 open tasks" } });
    expect(await app.snapshot()).toEqual(before);
  });

  it("fits exactly: with 93 open tasks the demo makes 100", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedOpenTasks(app.db, alice, 93);
    expect((await load()).status).toBe(201);
    const [{ n }] = await app.db.admin<{ n: number }>("select count(*)::int as n from app.tasks where user_id = $1 and status = 'open'", [alice]);
    expect(n).toBe(100);
  });

  it("answers 401 without a session, 403 from another site, 400 for a body that is not empty", async () => {
    const before = await app.snapshot();
    expect(await read(await load())).toEqual({ status: 401, body: { error: "unauthorized", message: "Please sign in." } });
    expect(await app.snapshot()).toEqual(before);

    await app.signedInAs("alice@example.com");
    const signedIn = await app.snapshot();
    expect((await load({ origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await loadDemo(postJson("/api/demo/load", { goals: 3 }), app.deps)).status).toBe(400);
    expect(await app.snapshot()).toEqual(signedIn);
  });
});

describe("remove_demo", () => {
  it("deletes exactly the demo rows, also changed ones, and leaves the user's own rows (own rows under a demo goal lose the goal)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedTask(app.db, alice, { title: "My own task" });
    await load();
    const [demoGoal] = await app.db.admin<{ id: string }>("select id from app.goals where user_id = $1 and title = 'Launch app v2'", [alice]);
    // The user changes a demo task and adds an own event and task under a demo goal.
    await app.db.admin("update app.tasks set title = 'Fix the onboarding bug today' where title = 'Fix the onboarding bug'");
    await seedEvent(app.db, alice, { title: "My own sprint", start: "2026-11-19T10:00:00Z", end: "2026-11-19T11:00:00Z", goalId: demoGoal.id });
    await seedTask(app.db, alice, { title: "My own bug", goalId: demoGoal.id });

    expect(await read(await remove())).toEqual({ status: 200, body: { message: "Demo data removed." } });

    expect(await goalsOf(alice)).toEqual([]);
    expect(await app.db.admin("select count(*)::int as n from app.rules where user_id = $1", [alice])).toEqual([{ n: 0 }]);
    expect((await tasksOf(alice)).map((t) => [t.title, t.goal])).toEqual([
      ["My own task", null],
      ["My own bug", null],
    ]);
    expect((await eventsOf(alice)).map((e) => [e.title, e.goal])).toEqual([["My own sprint", null]]);
    // The welcome stays answered.
    expect(await welcomeOf(alice)).toBe(true);
  });

  it("leaves another account's demo alone", async () => {
    const bob = await app.signedInAs("bob@example.com");
    await load();
    await app.signedInAs("alice@example.com");
    await load();
    await remove();
    expect(await goalsOf(bob)).toHaveLength(3);
    expect(await eventsOf(bob)).toHaveLength(20);
    expect(await tasksOf(bob)).toHaveLength(9);
  });

  it("is allowed without demo data and then changes nothing", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedTask(app.db, alice, { title: "My own task" });
    const before = await app.snapshot();
    expect((await remove()).status).toBe(200);
    expect(await app.snapshot()).toEqual(before);
  });

  it("answers 401 without a session, 403 from another site, 400 for a body that is not empty; nothing removed", async () => {
    await app.signedInAs("alice@example.com");
    await load();
    const loaded = await app.snapshot();
    expect((await remove({ origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await removeDemo(postJson("/api/demo/remove", { all: true }), app.deps)).status).toBe(400);
    expect(await app.snapshot()).toEqual(loaded);

    await app.auth.signOut();
    const signedOut = await app.snapshot();
    expect((await remove()).status).toBe(401);
    expect(await app.snapshot()).toEqual(signedOut);
  });
});

describe("start_fresh", () => {
  it("marks the welcome as answered and adds nothing", async () => {
    const alice = await app.signedInAs("alice@example.com");
    expect(await read(await fresh())).toEqual({ status: 200, body: { message: "Your calendar is ready." } });
    expect(await welcomeOf(alice)).toBe(true);
    expect(await goalsOf(alice)).toEqual([]);
    expect(await eventsOf(alice)).toEqual([]);
    expect(await tasksOf(alice)).toEqual([]);
  });

  it("answers 401 without a session and 403 from another site; nothing changes", async () => {
    const before = await app.snapshot();
    expect((await fresh()).status).toBe(401);
    expect(await app.snapshot()).toEqual(before);
    await app.signedInAs("alice@example.com");
    const signedIn = await app.snapshot();
    expect((await fresh({ origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect(await app.snapshot()).toEqual(signedIn);
  });
});

describe("demo events and Outlook", () => {
  /** Connects the fake Outlook the way the sign-in does it. */
  async function connectOutlook() {
    const code = app.outlook.account([]);
    const started = await startOutlookSignIn(postJson("/api/outlook/connect", {}), app.deps, app.outlookDeps);
    const state = new URL(started.headers.get("location")!).searchParams.get("state")!;
    const cookie = /^outlook_sign_in=([^;]*)/.exec(started.headers.get("set-cookie") ?? "")?.[1] ?? "";
    const callback = new Request(`${OWN_ORIGIN}/api/outlook/callback?${new URLSearchParams({ code, state })}`, {
      headers: { host: "localhost:3000", "sec-fetch-site": "cross-site", cookie: `outlook_sign_in=${cookie}` },
    });
    await finishOutlookSignIn(callback, app.deps, app.outlookDeps);
    return code;
  }

  it("never sends demo events to Outlook and never marks them 'Not sent to Outlook'; own events still go", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    await load();
    await seedEvent(app.db, alice, { title: "My own event", start: "2026-11-18T10:00:00Z", end: "2026-11-18T11:00:00Z" });
    const code = await connectOutlook();

    await sendOutlookNow(postJson("/api/outlook/send", {}), app.deps, app.outlookDeps);
    expect([...app.outlook.eventsOf(code).values()].map((e) => e.title)).toEqual(["My own event"]);
    expect(await app.db.admin("select count(*)::int as n from app.events where demo and outlook_id is not null")).toEqual([{ n: 0 }]);

    await app.db.admin("update app.events set outlook_id = null, outlook_sent_version = null where title = 'My own event'");
    const week = await loadWeek(app.deps, alice);
    const all = week.days.flatMap((d) => d.events);
    expect(all.filter((e) => e.notSent).map((e) => e.title)).toEqual(["My own event"]);
  });
});

describe("when the welcome shows", () => {
  const due = (userId: string) => app.db.withUser(userId, welcomeDue);

  it("shows for a new account, and not again once answered with either choice", async () => {
    const alice = await app.signedInAs("alice@example.com");
    expect(await due(alice)).toBe(true);
    await fresh();
    expect(await due(alice)).toBe(false);

    const bob = await app.signedInAs("bob@example.com");
    expect(await due(bob)).toBe(true);
    await load();
    await remove(); // the account is empty again, but the welcome was answered
    expect(await due(bob)).toBe(false);
  });

  it("does not show for an account that already has a goal, an event or a task", async () => {
    const withGoal = await app.signedInAs("goal@example.com");
    await seedGoal(app.db, withGoal, { deadline: "2027-03-14", rules: [{ kind: "count", target: 2 }] });
    const withEvent = await app.signedInAs("event@example.com");
    await seedEvent(app.db, withEvent, { start: "2026-11-17T10:00:00Z", end: "2026-11-17T11:00:00Z" });
    const withTask = await app.signedInAs("task@example.com");
    await seedTask(app.db, withTask);
    const empty = await app.signedInAs("empty@example.com");

    expect([await due(withGoal), await due(withEvent), await due(withTask), await due(empty)]).toEqual([false, false, false, true]);
  });
});
