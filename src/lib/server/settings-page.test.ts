// The settings page's data (spec 12): the signed-in user's own row, plan and Outlook state, and the
// display settings every page passes to the shell.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "@test/support/app";
import { readDisplay } from "./settings";
import { loadSettingsPage } from "./settings-page";

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

describe("loadSettingsPage", () => {
  it("returns the user's own settings with the defaults, the Free plan and no Outlook connection", async () => {
    const bob = await app.signedInAs("bob@example.com", { timeZone: "America/New_York" });
    await app.db.admin("update app.settings set time_format = '24h', home_address = 'Bob street 1' where user_id = $1", [bob]);
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Berlin" });

    const data = await loadSettingsPage(app.deps, alice);

    expect(data).toMatchObject({
      settings: {
        timeZone: "Europe/Berlin",
        homeAddress: "",
        travelMode: "driving",
        travelBufferMinutes: 10,
        timeFormat: "12h",
        dayStartHour: 7,
        dayEndHour: 21,
      },
      plan: "free",
      outlook: { status: "none", lastSyncedAt: null },
      today: "2026-11-16",
    });
  });

  it("readDisplay gives the time format and visible hours", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await app.db.admin("update app.settings set time_format = '24h', day_start_hour = 6, day_end_hour = 24 where user_id = $1", [alice]);
    expect(await app.db.withUser(alice, readDisplay)).toEqual({ timeFormat: "24h", dayStartHour: 6, dayEndHour: 24 });
  });
});
