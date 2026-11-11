import "server-only";

// The database module: the only place that connects to Postgres (Supabase).
// It exports withUser and nothing that gives raw access to the database.
import postgres from "postgres";
import { databaseUrl } from "@/lib/server/config";
import { createWithUser, type Driver, type Row, type WithUser } from "./with-user";

export type { Query, WithUser } from "./with-user";

let client: postgres.Sql | null = null;

function connection(): postgres.Sql {
  if (!client) {
    client = postgres(databaseUrl(), {
      // Supabase's transaction pooler does not support prepared statements.
      prepare: false,
      // Serverless functions are many and short-lived; keep few connections each.
      max: 3,
      idle_timeout: 20,
      // Give up after 10 seconds when the database cannot be reached (ontology section 7).
      connect_timeout: 10,
    });
  }
  return client;
}

const postgresDriver: Driver = {
  transaction(fn) {
    return connection().begin((tx) =>
      fn(async (sql, params) => (await tx.unsafe(sql, params as postgres.ParameterOrJSON<never>[])) as unknown as Row[]),
    ) as never;
  },
};

/** Runs `fn` in one transaction as the signed-in user. See with-user.ts. */
export const withUser: WithUser = createWithUser(postgresDriver);
