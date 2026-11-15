// The page loaders of spec 28: the People page reads in one transaction; the settings page with the
// Profile card opens the same two transactions as before (finishing sessions, then every read) and
// returns the same data plus the user's own profile.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "@test/support/app";
import { countingWithUser } from "@test/support/counting";
import { loadPeoplePage, loadSettingsPageAll, loadSettingsPageWithProfile } from "./load";

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

describe("page loaders of spec 28", () => {
  it("the People page: one transaction, the user's own profile and nothing of strangers", async () => {
    await app.signedInAs("bob@example.com");
    const alice = await app.signedInAs("alice@example.com", { timeZone: "America/New_York" });
    const { withUser, transactions } = countingWithUser(app.db);
    const page = await loadPeoplePage({ withUser }, alice);
    expect(transactions).toHaveLength(1);
    expect(page.timeZone).toBe("America/New_York");
    expect(page.people).toEqual({
      me: { userId: alice, displayName: null, name: "alice", email: "alice@example.com", photoUrl: null },
      contacts: [],
      received: [],
      sent: [],
    });
  });

  it("the settings page with the profile: two transactions, the same data as before plus the profile", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const counted = countingWithUser(app.db);
    const page = await loadSettingsPageWithProfile({ withUser: counted.withUser, now: app.deps.now }, alice);
    expect(counted.transactions).toHaveLength(2);
    const { profile, ...rest } = page;
    expect(rest).toEqual(await loadSettingsPageAll(app.deps, alice));
    expect(profile).toEqual({ userId: alice, displayName: null, name: "alice", email: "alice@example.com", photoUrl: null });
  });
});
