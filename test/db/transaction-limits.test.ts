// The limits for a whole transaction (src/lib/server/db/with-user.ts, added 19 Nov 2026). On 19 Nov a
// server process frozen in the middle of a transaction kept a lock on one profile row for 17 minutes;
// the database now ends such a transaction itself. Here: every transaction of withUser and of the
// billing store carries the limits, they are gone again after the transaction, and the statement also
// works on a Postgres that does not know `transaction_timeout` (it exists since Postgres 17).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBillingStore } from "@/lib/server/db/billing";
import { IDLE_IN_TRANSACTION_LIMIT, TRANSACTION_LIMIT, TRANSACTION_LIMITS, userSettingsStatement } from "@/lib/server/db/with-user";
import type { Driver, Row } from "@/lib/server/db/with-user";
import { createTestDb, type TestDb } from "./harness";

let db: TestDb;
let alice: string;
/** Whether this test database is a Postgres that knows `transaction_timeout` (17 or newer). */
let knowsTransactionTimeout: boolean;

beforeAll(async () => {
  db = await createTestDb();
  alice = await db.createUser("alice@example.com", { confirmed: true });
  const rows = await db.admin<{ n: number }>("select count(*)::integer as n from pg_settings where name = 'transaction_timeout'");
  knowsTransactionTimeout = rows[0].n === 1;
});

afterAll(async () => {
  await db.close();
});

const milliseconds = (limit: string) => Number(limit.replace("s", "")) * 1000;

describe("the limits for a whole transaction", () => {
  it("are part of the statement that opens every transaction of a user", () => {
    const statement = userSettingsStatement(alice);
    expect(statement).toContain(TRANSACTION_LIMITS);
    expect(statement).toContain(`set_config('idle_in_transaction_session_timeout', '${IDLE_IN_TRANSACTION_LIMIT}', true)`);
    expect(statement).toContain(`set_config('transaction_timeout', '${TRANSACTION_LIMIT}', true)`);
    // Longer than the 10 seconds one statement may take, and short enough that a hang ends within a minute.
    expect(milliseconds(IDLE_IN_TRANSACTION_LIMIT)).toBeGreaterThan(10_000);
    expect(milliseconds(TRANSACTION_LIMIT)).toBeGreaterThanOrEqual(milliseconds(IDLE_IN_TRANSACTION_LIMIT));
    expect(milliseconds(TRANSACTION_LIMIT)).toBeLessThanOrEqual(60_000);
  });

  it("hold inside a transaction of withUser, also where the database does not know transaction_timeout", async () => {
    const inside = await db.withUser(alice, async (query) => {
      const [idle] = await query<{ ms: string }>(
        "select (select setting from pg_settings where name = 'idle_in_transaction_session_timeout') as ms",
      );
      const [whole] = await query<{ ms: string | null }>("select (select setting from pg_settings where name = 'transaction_timeout') as ms");
      const [who] = await query<{ role: string; uid: string }>("select current_user::text as role, auth.uid()::text as uid");
      return { idle: idle.ms, whole: whole.ms, who };
    });
    // The statement worked as a whole: the transaction is the user's, as before.
    expect(inside.who).toEqual({ role: "authenticated", uid: alice });
    expect(Number(inside.idle)).toBe(milliseconds(IDLE_IN_TRANSACTION_LIMIT));
    if (knowsTransactionTimeout) expect(Number(inside.whole)).toBe(milliseconds(TRANSACTION_LIMIT));
    else expect(inside.whole).toBeNull();
  });

  it("are local: after the transaction the connection has no limit left", async () => {
    await db.withUser(alice, (query) => query("select 1"));
    const [after] = await db.admin<{ idle: string }>("select setting as idle from pg_settings where name = 'idle_in_transaction_session_timeout'");
    expect(Number(after.idle)).toBe(0);
  });

  it("are the first statement of the billing store's transaction too", async () => {
    const sent: string[] = [];
    const recording: Driver = {
      transaction: (fn) =>
        db.driver.transaction((run) =>
          fn((sql: string, params: readonly unknown[]): Promise<Row[]> => {
            sent.push(sql);
            return run(sql, params);
          }),
        ),
    };
    await createBillingStore(recording).applyPlan({ userId: alice, customerId: null, plan: "pro" });
    expect(sent[0]).toBe(`select ${TRANSACTION_LIMITS}`);
    expect(sent.length).toBeGreaterThan(1);
    const [row] = await db.admin<{ plan: string }>("select plan from app.profiles where id = $1", [alice]);
    expect(row.plan).toBe("pro");
  });
});
