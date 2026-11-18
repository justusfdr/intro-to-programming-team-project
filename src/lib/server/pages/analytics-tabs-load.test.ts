// Tests for what the Analytics page in tabs loads (spec 49): the week's report and the user's layout
// of widgets: the saved one, or the standard one when nothing (or nothing usable) is saved.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "@test/support/app";
import { seedSession } from "@test/support/sessions";
import { standardLayout } from "@/lib/analytics/layout";
import { STANDARD_LAYOUT } from "@/lib/analytics/report-types";
import { loadAnalyticsTabsPage } from "./load";

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

function save(userId: string, layout: unknown) {
  return app.db.admin("update app.settings set analytics_widgets = $1::text::jsonb where user_id = $2", [JSON.stringify(layout), userId]);
}

describe("loadAnalyticsTabsPage", () => {
  it("gives a new account the standard layout and an empty report of the current week", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const page = await loadAnalyticsTabsPage(app.deps, alice);
    expect(page.layout).toEqual(STANDARD_LAYOUT);
    expect(page.isStandardLayout).toBe(true);
    expect(page.report.monday).toBe("2026-11-16");
    expect(page.report.focus.week.sessions).toBe(0);
    expect(page.display).toBeDefined();
  });

  it("gives the saved layout, and the report of the week that was asked for", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const saved = { ...standardLayout(), blocked: [{ kind: "top_sites", size: "M" }] };
    await save(alice, saved);
    await seedSession(app.db, alice, { status: "finished", plannedMinutes: 30, startedAt: "2026-11-10T09:00:00Z", endedAt: "2026-11-10T09:30:00Z" });

    const page = await loadAnalyticsTabsPage(app.deps, alice, "2026-11-11");

    expect(page.layout).toEqual(saved);
    expect(page.isStandardLayout).toBe(false);
    expect(page.report.monday).toBe("2026-11-09");
    expect(page.report.focus.week).toMatchObject({ sessions: 1, focusedMinutes: 30 });
  });

  it("falls back to the standard layout when the saved one is no longer allowed", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await save(alice, { ...standardLayout(), focus: [{ kind: "a_widget_that_is_gone", size: "S" }] });
    const page = await loadAnalyticsTabsPage(app.deps, alice);
    expect(page.layout).toEqual(STANDARD_LAYOUT);
    expect(page.isStandardLayout).toBe(true);
  });

  it("never shows another user's layout or sessions (R3)", async () => {
    const bob = await app.signedInAs("bob@example.com");
    await save(bob, { ...standardLayout(), time: [] });
    await seedSession(app.db, bob, { status: "finished", plannedMinutes: 30, startedAt: "2026-11-16T07:00:00Z", endedAt: "2026-11-16T07:30:00Z" });
    const alice = await app.signedInAs("alice@example.com");

    const page = await loadAnalyticsTabsPage(app.deps, alice);

    expect(page.isStandardLayout).toBe(true);
    expect(page.layout.time).toEqual(STANDARD_LAYOUT.time);
    expect(page.report.focus.week.sessions).toBe(0);
  });

  it("counts a session that finished by itself (R13)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedSession(app.db, alice, { plannedMinutes: 15, startedAt: "2026-11-16T08:00:00Z" }); // due 08:15
    const page = await loadAnalyticsTabsPage(app.deps, alice);
    expect(page.report.focus.week).toMatchObject({ focusedMinutes: 15, sessions: 1, score: 100 });
  });
});
