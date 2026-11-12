// withUser's order guarantee, with a stand-in driver that records what is sent and when:
// the role-and-identity statement is always sent first, travels together with the first query
// (no round trip of its own), and no result is handed out unless it succeeded.
// The real database behaviour (role, rollback, refused statements) is tested in test/db/accounts-schema.test.ts.
import { describe, expect, it } from "vitest";
import { createWithUser, userSettingsStatement, type Driver, type Row } from "./with-user";

const ALICE = "6f1c1a5e-0a39-4d0f-9a49-6f3f7d0b2a11";

/**
 * A driver that writes statements to a log as they are sent and answers each one later, as a
 * database across the network would. A statement's round is 1 + the number of answers that had
 * arrived when it was sent: statements sent together, before any answer, are all in round 1.
 */
function recordingDriver(options: { failSettings?: boolean } = {}) {
  const sent: { sql: string; round: number }[] = [];
  let answers = 0;
  const driver: Driver = {
    async transaction(fn) {
      return fn((sql) => {
        sent.push({ sql, round: answers + 1 });
        return new Promise<Row[]>((resolve, reject) => {
          setTimeout(() => {
            answers += 1;
            if (options.failSettings && sql.includes("set_config")) reject(new Error("settings failed"));
            else resolve([{ sql }]);
          }, 0);
        });
      });
    },
  };
  return { driver, sent };
}

describe("withUser with pipelining", () => {
  it("sends the settings statement first and the first query in the same round trip", async () => {
    const { driver, sent } = recordingDriver();
    await createWithUser(driver)(ALICE, (q) => q("select 1"));
    expect(sent.map((s) => s.sql)).toEqual([userSettingsStatement(ALICE), "select 1"]);
    expect(sent.map((s) => s.round)).toEqual([1, 1]);
  });

  it("sends queries started together in one round trip, after the settings statement", async () => {
    const { driver, sent } = recordingDriver();
    await createWithUser(driver)(ALICE, (q) => Promise.all([q("select 'a'"), q("select 'b'"), q("select 'c'")]));
    expect(sent[0].sql).toBe(userSettingsStatement(ALICE));
    expect(sent.map((s) => s.round)).toEqual([1, 1, 1, 1]);
  });

  it("hands out no result and commits nothing when the settings statement fails", async () => {
    const { driver } = recordingDriver({ failSettings: true });
    let seen: unknown = "nothing";
    await expect(
      createWithUser(driver)(ALICE, async (q) => {
        seen = await q("select 1");
      }),
    ).rejects.toThrow("settings failed");
    expect(seen).toBe("nothing");
  });

  it("fails even when the callback sends no query, if the settings statement failed", async () => {
    const { driver } = recordingDriver({ failSettings: true });
    await expect(createWithUser(driver)(ALICE, async () => "done")).rejects.toThrow("settings failed");
  });

  it("checks for forbidden statements before anything of the callback is sent", async () => {
    const { driver, sent } = recordingDriver();
    await expect(createWithUser(driver)(ALICE, (q) => q("set role postgres"))).rejects.toThrow(/may not run inside withUser/);
    expect(sent.map((s) => s.sql)).toEqual([userSettingsStatement(ALICE)]);
  });

  it("refuses a user id that is not a uuid before opening a transaction", async () => {
    const { driver, sent } = recordingDriver();
    await expect(createWithUser(driver)("x', true); select 1; --", (q) => q("select 1"))).rejects.toThrow(/uuid/);
    expect(sent).toEqual([]);
    expect(() => userSettingsStatement("' or 1=1 --")).toThrow(/uuid/);
  });

  it("writes only the checked uuid into the settings statement", () => {
    const statement = userSettingsStatement(ALICE);
    expect(statement).toContain(`'${ALICE}'`);
    expect(statement).toContain(`'{"sub":"${ALICE}","role":"authenticated"}'`);
    // Four quoted settings names and values, and nothing else in quotes.
    expect(statement.match(/'/g)?.length).toBe(16);
  });
});
