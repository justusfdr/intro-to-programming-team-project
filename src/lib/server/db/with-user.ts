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

/** What a database driver must offer: run a callback inside one transaction. */
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

/** Builds withUser on top of a driver. Production uses the Postgres driver; tests use the in-process one. */
export function createWithUser(driver: Driver): WithUser {
  return async function withUser(userId, fn) {
    if (!UUID.test(userId)) throw new Error("withUser needs a user id (uuid).");

    return driver.transaction(async (run) => {
      // Same settings Supabase's data API uses: role, the JWT claims and the user id.
      // A 10-second limit per statement, so a stuck query gives up (ontology section 7).
      await run(
        `select set_config('role', 'authenticated', true),
                set_config('request.jwt.claims', $1, true),
                set_config('request.jwt.claim.sub', $2, true),
                set_config('statement_timeout', '10s', true)`,
        [JSON.stringify({ sub: userId, role: "authenticated" }), userId],
      );

      const query: Query = async <T extends Row = Row>(sql: string, params: readonly unknown[] = []) => {
        if (FORBIDDEN.test(sql)) throw new ForbiddenStatementError();
        return (await run(sql, params)) as T[];
      };
      return fn(query);
    });
  };
}
