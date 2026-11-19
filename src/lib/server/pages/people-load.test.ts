// The People page's loader (spec 53, from spec 28): one transaction, the user's own profile and nothing
// of strangers. (The settings page's own loaders are tested by spec 40's tests.)
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "@test/support/app";
import { countingWithUser } from "@test/support/counting";
import { loadPeoplePage } from "./load";

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

describe("the People page loader", () => {
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
});
