import "server-only";

// The one way into the database: every query runs inside a transaction as the role "authenticated"
// with the signed-in user's id, exactly as Supabase's auth.uid() reads it. Row-level security
// then limits the query to that user's rows (ontology R3).

/** A row as the driver returns it. */
export type Row = Record<string, unknown>;

/** The query handle passed to the callback of withUser. Use $1, $2 … placeholders, never string building. */
export interface Query {
  <T extends Row = Row>(sql: string, params?: readonly unknown[]): Promise<T[]>;
}

/**
 * What a database driver must offer: run a callback inside one transaction that has already begun.
 * `run` must send statements to the database in the order it is called, on the transaction's one
 * connection, without waiting for earlier statements to finish (so statements started together
 * travel together). Postgres runs them in that order; after a failed statement the transaction is
 * aborted and every later statement in it fails too.
 */
export interface Driver {
  transaction<R>(fn: (run: (sql: string, params: readonly unknown[]) => Promise<Row[]>) => Promise<R>): Promise<R>;
}

/** Runs `fn` inside one transaction as `userId`. Commits if `fn` resolves, rolls back if it throws (R1). */
export type WithUser = <R>(userId: string, fn: (query: Query) => Promise<R>) => Promise<R>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Statements that could switch away from the user's role or identity. The callback must never run them.
// This is a second safety net; code review is the first.
const FORBIDDEN =
  /\b(?:set|reset)\s+(?:local\s+|session\s+)?(?:role|session\s+authorization|"?request\.)|\bset_config\s*\(|\bsession_authorization\b/i;

export class ForbiddenStatementError extends Error {
  constructor() {
    super("This statement may not run inside withUser.");
    this.name = "ForbiddenStatementError";
  }
}

/**
 * The statement that makes the transaction the user's: the same settings Supabase's data API uses
 * (role, the JWT claims and the user id), and a 10-second limit per statement, so a stuck query
 * gives up (ontology section 7). All four are local to the transaction.
 *
 * It has no parameters, so the driver can send it in the same round trip as the first query (with
 * parameters, the driver would first ask the database for their types: one more round trip). The
 * user id may stand in the text only because it has passed the UUID check: hex digits and dashes,
 * nothing that could end the quoted string.
 */
export function userSettingsStatement(userId: string): string {
  if (!UUID.test(userId)) throw new Error("withUser needs a user id (uuid).");
  const claims = JSON.stringify({ sub: userId, role: "authenticated" });
  return `select set_config('role', 'authenticated', true),
                set_config('request.jwt.claims', '${claims}', true),
                set_config('request.jwt.claim.sub', '${userId}', true),
                set_config('statement_timeout', '10s', true)`;
}

/** Builds withUser on top of a driver. Production uses the Postgres driver; tests use the in-process one. */
export function createWithUser(driver: Driver): WithUser {
  return async function withUser(userId, fn) {
    if (!UUID.test(userId)) throw new Error("withUser needs a user id (uuid).");
    const settings = userSettingsStatement(userId);

    return driver.transaction(async (run) => {
      // Sent first, before the callback can send anything: the driver keeps the order of `run`
      // calls, so every query of the callback runs after it, in the same transaction. It is not
      // awaited here, so it travels together with the first query instead of costing a round trip.
      const ready = run(settings, []);
      // Its failure is reported below (by every query and by the end of the transaction).
      ready.catch(() => {});

      const query: Query = async <T extends Row = Row>(sql: string, params: readonly unknown[] = []) => {
        if (FORBIDDEN.test(sql)) throw new ForbiddenStatementError();
        // A result is handed out only once the settings statement has succeeded. (If it failed, the
        // database has already refused this query, because the transaction is aborted.)
        const [, rows] = await Promise.all([ready, run(sql, params)]);
        return rows as T[];
      };

      const result = await fn(query);
      // Even a callback that sent no query commits only when the settings statement succeeded.
      await ready;
      return result;
    });
  };
}
