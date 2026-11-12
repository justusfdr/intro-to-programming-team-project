// A driver around the test database that counts transactions and records, per transaction, each
// statement sent and how many answers had come back when it was sent (0 = it went out together with
// the identity statement, in the first round). Used to prove "one transaction per page" and
// "independent reads sent together".
import { createWithUser, type Driver, type WithUser } from "@/lib/server/db/with-user";
import type { TestDb } from "../db/harness";

export type Sent = { sql: string; withParams: boolean; answersBefore: number };

export function countingWithUser(db: TestDb): { withUser: WithUser; transactions: Sent[][] } {
  const transactions: Sent[][] = [];
  const driver: Driver = {
    transaction(fn) {
      const sent: Sent[] = [];
      transactions.push(sent);
      let answers = 0;
      return db.driver.transaction((run) =>
        fn((sql, params) => {
          sent.push({ sql, withParams: params.length > 0, answersBefore: answers });
          return run(sql, params).finally(() => {
            answers += 1;
          });
        }),
      );
    },
  };
  return { withUser: createWithUser(driver), transactions };
}

/** The statements of a transaction that went out in its first round. */
export function firstRoundOf(sent: Sent[]): string[] {
  return sent.filter((s) => s.answersBefore === 0).map((s) => s.sql);
}

/**
 * Statements sent in the same round that, with the real driver, would be held back: a statement
 * without parameters sent after one with parameters (the driver first asks for the parameters' types
 * and sends what was started after it only one by one once it is done; see src/lib/server/db/index.ts).
 * An empty list means every round goes out as one.
 */
export function heldBack(sent: Sent[]): string[] {
  const held: string[] = [];
  const paramSeenInRound = new Set<number>();
  for (const s of sent) {
    if (s.withParams) paramSeenInRound.add(s.answersBefore);
    else if (paramSeenInRound.has(s.answersBefore)) held.push(s.sql);
  }
  return held;
}
