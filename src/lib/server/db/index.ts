import "server-only";

// The database module: the only place that connects to Postgres (Supabase).
// It exports withUser and nothing that gives raw access to the database.
import postgres from "postgres";
import { databaseCaCert, databaseUrl } from "@/lib/server/config";
import { connectionOptions, UNVERIFIED_WARNING } from "./options";
import { createWithUser, type Driver, type Row, type WithUser } from "./with-user";

export type { Query, WithUser } from "./with-user";

let client: postgres.Sql | null = null;

function connection(): postgres.Sql {
  if (!client) {
    // Always encrypted unless the database is on this computer; see options.ts.
    const { options, protection } = connectionOptions(databaseUrl(), databaseCaCert());
    if (protection === "encrypted_unverified") console.warn(UNVERIFIED_WARNING);
    client = postgres(databaseUrl(), options);
  }
  return client;
}

const postgresDriver: Driver = {
  transaction(fn) {
    // The library sends BEGIN and waits for it, then calls us with the transaction's handle; every
    // statement on that handle goes to the transaction's one connection, in the order it is handed
    // over. `execute()` hands it over now (statements are otherwise sent only when awaited), so the
    // order of `run` calls is the order on the connection, and statements started together are
    // written together. Commit (or rollback when the callback throws) follows the callback.
    return connection().begin((tx) =>
      fn((sql, params) =>
        tx.unsafe(sql, params as postgres.ParameterOrJSON<never>[]).execute().then((rows) => rows as unknown as Row[]),
      ),
    ) as never;
  },
};

/** Runs `fn` in one transaction as the signed-in user. See with-user.ts. */
export const withUser: WithUser = createWithUser(postgresDriver);
