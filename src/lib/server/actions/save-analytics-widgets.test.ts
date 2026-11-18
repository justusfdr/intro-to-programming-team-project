// Tests for save_analytics_widgets (spec 49, "Edit widgets"): a layout is saved only if every tab's
// widgets are allowed there, in one of their sizes, at most once, and fit in the tab's 4 x 2 fields.
// Every rejected case leaves the saved value as it was (R1).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { standardLayout } from "@/lib/analytics/layout";
import { STANDARD_LAYOUT, type AnalyticsLayout } from "@/lib/analytics/report-types";
import { saveAnalyticsWidgets } from "./save-analytics-widgets";

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

function send(body: unknown, headers?: Record<string, string>) {
  return saveAnalyticsWidgets(postJson("/api/analytics/widgets", body, headers), app.deps);
}

async function savedOf(userId: string) {
  const [row] = await app.db.admin<{ analytics_widgets: unknown }>("select analytics_widgets from app.settings where user_id = $1", [userId]);
  return row.analytics_widgets;
}

/** The standard layout with one tab replaced. */
const withTab = (tab: keyof AnalyticsLayout, items: unknown): Record<string, unknown> => ({ ...standardLayout(), [tab]: items });

const SAVED = withTab("blocked", [{ kind: "top_sites", size: "M" }, { kind: "blocked_visits", size: "S" }]);

/** Saves SAVED first, so a refusal can be shown to leave it as it was. */
async function withSaved() {
  const alice = await app.signedInAs("alice@example.com");
  expect((await send({ layout: SAVED })).status).toBe(200);
  return alice;
}

describe("save_analytics_widgets accepted", () => {
  it("saves a layout and answers with it", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const answer = await read(await send({ layout: SAVED }));
    expect(answer).toEqual({ status: 200, body: { layout: SAVED, isStandard: false } });
    expect(await savedOf(alice)).toEqual(SAVED);
  });

  it("saves the standard layout as the user's own, and a tab with nothing on it", async () => {
    const alice = await app.signedInAs("alice@example.com");
    expect((await read(await send({ layout: STANDARD_LAYOUT }))).body).toEqual({ layout: STANDARD_LAYOUT, isStandard: false });
    const empty = withTab("time", []);
    expect((await send({ layout: empty })).status).toBe(200);
    expect(await savedOf(alice)).toEqual(empty);
  });

  it("saves a tab that is exactly full: eight small widgets on the Overview", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const kinds = ["focus_score", "sessions", "best_of_week", "deadlines", "busiest_day", "time_on_goals", "blocked_visits", "clean_sessions"];
    const full = withTab("overview", kinds.map((kind) => ({ kind, size: "S" })));
    expect((await send({ layout: full })).status).toBe(200);
    expect(await savedOf(alice)).toEqual(full);
  });

  it("reset brings back the standard layout: nothing is saved any more", async () => {
    const alice = await withSaved();
    const answer = await read(await send({ reset: true }));
    expect(answer).toEqual({ status: 200, body: { layout: STANDARD_LAYOUT, isStandard: true } });
    expect(await savedOf(alice)).toBeNull();
  });

  it("saves only the signed-in user's own row", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const bob = await app.signedInAs("bob@example.com");
    await send({ layout: SAVED });
    expect(await savedOf(bob)).toEqual(SAVED);
    expect(await savedOf(alice)).toBeNull();
  });
});

describe("save_analytics_widgets rejected: nothing changes", () => {
  async function expectRefused(body: unknown, status: number, message?: string, headers?: Record<string, string>) {
    const alice = await withSaved();
    const before = await app.snapshot();
    const answer = await read(await send(body, headers));
    expect(answer.status).toBe(status);
    if (message) expect(answer.body.message).toBe(message);
    expect(await app.snapshot()).toEqual(before);
    expect(await savedOf(alice)).toEqual(SAVED);
  }

  it("a tab that does not fit on one screen", async () => {
    const nine = ["focus_score", "sessions", "best_of_week", "deadlines", "busiest_day", "time_on_goals", "blocked_visits", "clean_sessions", "top_areas"];
    await expectRefused({ layout: withTab("overview", nine.map((kind) => ({ kind, size: "S" }))) }, 400, "No room on this tab. Remove or shrink a widget first");
    const threeRows = [{ kind: "weeks", size: "L" }, { kind: "focus_time", size: "M" }, { kind: "best_hours", size: "M" }, { kind: "sessions", size: "S" }, { kind: "focus_score", size: "S" }];
    await expectRefused({ layout: withTab("focus", threeRows) }, 400, "No room on this tab. Remove or shrink a widget first");
  });

  it("a widget that does not exist", async () => {
    await expectRefused({ layout: withTab("focus", [{ kind: "weather", size: "S" }]) }, 400, "Choose a widget from the list");
    await expectRefused({ layout: withTab("focus", [{ size: "S" }]) }, 400, "Choose a widget from the list");
  });

  it("a widget on a tab it does not belong to", async () => {
    await expectRefused({ layout: withTab("goals", [{ kind: "top_sites", size: "M" }]) }, 400, "This widget does not belong on that tab");
  });

  it("a size the widget does not come in", async () => {
    await expectRefused({ layout: withTab("focus", [{ kind: "focus_score", size: "L" }]) }, 400, "This widget does not come in that size");
    await expectRefused({ layout: withTab("focus", [{ kind: "focus_time", size: "S" }]) }, 400, "This widget does not come in that size");
  });

  it("the same widget twice on one tab", async () => {
    const twice = [{ kind: "focus_time", size: "M" }, { kind: "focus_time", size: "L" }];
    await expectRefused({ layout: withTab("focus", twice) }, 400, "A widget can be on a tab only once");
  });

  it("a layout that does not name exactly the six tabs", async () => {
    const missing: Record<string, unknown> = standardLayout();
    delete missing.streaks;
    await expectRefused({ layout: missing }, 400, "Widgets must be a list for each tab");
    await expectRefused({ layout: { ...standardLayout(), settings: [] } }, 400, "Widgets must be a list for each tab");
    await expectRefused({ layout: withTab("goals", "everything") }, 400, "Widgets must be a list for each tab");
  });

  it("a body that is neither a layout nor a reset", async () => {
    await expectRefused({}, 400);
    await expectRefused({ layout: [] }, 400);
    await expectRefused({ reset: false }, 400);
    await expectRefused({ layout: SAVED, reset: true }, 400);
  });

  it("a request from another site", async () => {
    await expectRefused({ reset: true }, 403, undefined, { origin: "https://evil.example" });
  });

  it("signed out: 401, and nothing is saved", async () => {
    const alice = await withSaved();
    await app.auth.signOut();
    expect((await send({ layout: standardLayout() })).status).toBe(401);
    expect((await send({ reset: true })).status).toBe(401);
    expect(await savedOf(alice)).toEqual(SAVED);
  });
});
