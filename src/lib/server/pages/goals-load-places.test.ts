// The Goals page with the saved places (spec 42: the guided questions and the goal editor offer them as
// a goal's place): the same two transactions as loadGoalsPage, the same goals, tasks and date, and only
// the signed-in user's places (R3).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "@test/support/app";
import { countingWithUser, heldBack } from "@test/support/counting";
import { HALF_MARATHON, seedGoal } from "@test/support/goals";
import { loadGoalsPage, loadGoalsPageWithPlaces } from "./load";

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

const addPlace = (user: string, name: string, address: string) =>
  app.db.withUser(user, (q) => q("insert into app.places (name, address) values ($1, $2)", [name, address]));

describe("goals page with the saved places", () => {
  it("opens 2 transactions and reads the places with everything loadGoalsPage reads", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    await seedGoal(app.db, alice, HALF_MARATHON);
    await addPlace(alice, "Gym", "FitnessHut Lisboa");

    const { withUser, transactions } = countingWithUser(app.db);
    const page = await loadGoalsPageWithPlaces({ withUser, now: app.deps.now }, alice);
    expect(transactions).toHaveLength(2);
    for (const sent of transactions) expect(heldBack(sent)).toEqual([]);

    const { places, ...rest } = page;
    expect(rest).toEqual(await loadGoalsPage(app.deps, alice));
    expect(places.map(({ name, address }) => ({ name, address }))).toEqual([{ name: "Gym", address: "FitnessHut Lisboa" }]);
  });

  it("reads only the signed-in user's places (R3)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const bob = await app.signedInAs("bob@example.com");
    await addPlace(bob, "Bob home", "Rua Augusta 1");
    expect((await loadGoalsPageWithPlaces(app.deps, alice)).places).toEqual([]);
  });
});
