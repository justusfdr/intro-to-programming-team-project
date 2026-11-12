// Tests for delete_account (ontology section 5; spec 12): all the user's rows and the sign-in account
// go, the session ends; Pro must be cancelled first; a rejected request changes nothing (R1).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { seedEvent } from "@test/support/events";
import { seedGoal } from "@test/support/goals";
import { deleteAccount } from "./delete-account";

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
  return deleteAccount(postJson("/api/account/delete", body, headers), app.deps);
}

/** How many rows of `userId` each app table holds, plus the sign-in account. */
async function rowsOf(userId: string): Promise<Record<string, number>> {
  const tables = await app.db.admin<{ name: string; has_user: boolean }>(
    `select t.table_name as name,
            exists (select 1 from information_schema.columns c
                     where c.table_schema = 'app' and c.table_name = t.table_name and c.column_name = 'user_id') as has_user
       from information_schema.tables t where t.table_schema = 'app' order by 1`,
  );
  const counts: Record<string, number> = {};
  for (const { name, has_user } of tables) {
    const column = has_user ? "user_id" : "id";
    const [row] = await app.db.admin<{ n: number }>(`select count(*)::int as n from app.${name} where ${column} = $1`, [userId]);
    counts[name] = row.n;
  }
  const [user] = await app.db.admin<{ n: number }>("select count(*)::int as n from auth.users where id = $1", [userId]);
  counts["auth.users"] = user.n;
  return counts;
}

async function withSomeData(userId: string) {
  const goal = await seedGoal(app.db, userId, { title: "Run a half marathon", deadline: "2027-03-14", rules: [{ kind: "hours", target: 4 }] });
  await seedEvent(app.db, userId, { title: "Long run", start: "2026-11-17T08:00:00Z", end: "2026-11-17T09:00:00Z", goalId: goal.id });
}

describe("delete_account accepted", () => {
  it("deletes every row of the user and the sign-in account, ends the session and sends to sign-in", async () => {
    const bob = await app.signedInAs("bob@example.com");
    await withSomeData(bob);
    const alice = await app.signedInAs("alice@example.com");
    await withSomeData(alice);
    expect(Object.values(await rowsOf(alice)).some((n) => n > 0)).toBe(true);

    const answer = await read(await send({ confirm: "DELETE" }));

    expect(answer).toEqual({ status: 200, body: { message: "Your account and all its data are deleted.", next: "/sign-in" } });
    expect(Object.values(await rowsOf(alice)).every((n) => n === 0)).toBe(true);
    expect(app.auth.session).toBeNull();
    // Bob's account and rows stay.
    const bobRows = await rowsOf(bob);
    expect(bobRows["auth.users"]).toBe(1);
    expect(bobRows.settings).toBe(1);
    expect(bobRows.events).toBe(1);
    expect(bobRows.goals).toBe(1);
  });
});

describe("delete_account rejected: nothing changes (R1)", () => {
  it("rejects without the typed confirmation: 'Type DELETE to confirm'", async () => {
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    for (const confirm of ["", "delete", "yes"]) {
      expect(await read(await send({ confirm }))).toEqual({ status: 400, body: { error: "confirm", message: "Type DELETE to confirm" } });
    }
    expect(await app.snapshot()).toEqual(before);
  });

  it("rejects while the plan is Pro: 'Cancel Pro before deleting your account'", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await app.db.admin("update app.profiles set plan = 'pro' where id = $1", [alice]);
    const before = await app.snapshot();
    expect(await read(await send({ confirm: "DELETE" }))).toEqual({
      status: 409,
      body: { error: "cancel_pro", message: "Cancel Pro before deleting your account" },
    });
    expect(await app.snapshot()).toEqual(before);
  });

  it("rejects a missing or malformed body as an invalid request", async () => {
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    expect((await send({})).status).toBe(400);
    expect((await send({ confirm: "DELETE", userId: "someone-else" })).status).toBe(400);
    expect(await app.snapshot()).toEqual(before);
  });

  it("rejects a signed-out request (401)", async () => {
    await app.auth.addUser("alice@example.com", "test-password", { confirmed: true });
    const before = await app.snapshot();
    expect(await read(await send({ confirm: "DELETE" }))).toEqual({ status: 401, body: { error: "unauthorized", message: "Please sign in." } });
    expect(await app.snapshot()).toEqual(before);
  });

  it("rejects a request from another site (403)", async () => {
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    const response = await send({ confirm: "DELETE" }, { origin: "https://evil.example", "sec-fetch-site": "cross-site" });
    expect(response.status).toBe(403);
    expect(await app.snapshot()).toEqual(before);
  });

  it("rejects a body over the size cap (413)", async () => {
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    expect((await send(JSON.stringify({ confirm: "x".repeat(20_000) }))).status).toBe(413);
    expect(await app.snapshot()).toEqual(before);
  });
});
