// Test harness: a temporary, in-process Postgres (PGlite) with the same migration files
// that run in Supabase. Each call to createTestDb() gives a fresh, empty database.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { createWithUser, type Driver, type Row, type WithUser } from "@/lib/server/db/with-user";

const ROOT = join(__dirname, "..", "..");
const SHIM = readFileSync(join(__dirname, "supabase-shim.sql"), "utf8");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");

/** All migration files in name order, as the team member runs them in the SQL editor. */
function migrationNames(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

const migrationSql = (name: string) => readFileSync(join(MIGRATIONS_DIR, name), "utf8");

export interface TestDb {
  /** The same helper the app uses, running on the test database. */
  withUser: WithUser;
  /** The driver under withUser, for tests that wrap it (for example to count transactions). */
  driver: Driver;
  /** Runs SQL as the database owner, bypassing row-level security. For setup and checks in tests only. */
  admin<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  /**
   * Runs the migration files that `createTestDb({ stopBefore })` left out (none otherwise), to test
   * what a migration does to rows saved before it.
   */
  migrateRest(): Promise<void>;
  /** Creates a user the way Supabase Auth does (a row in auth.users); returns the id. */
  createUser(email: string, options?: { id?: string; timeZone?: string; confirmed?: boolean }): Promise<string>;
  close(): Promise<void>;
}

/** `stopBefore`: run only the migration files whose names sort before this one (the rest with migrateRest). */
export async function createTestDb(options: { stopBefore?: string } = {}): Promise<TestDb> {
  const db = new PGlite();
  await db.exec(SHIM);
  const names = migrationNames();
  const first = options.stopBefore === undefined ? names : names.filter((name) => name < options.stopBefore!);
  let rest = names.slice(first.length);
  for (const name of first) await db.exec(migrationSql(name));

  const driver: Driver = {
    transaction: (fn) =>
      db.transaction((tx) => fn(async (sql, params) => (await tx.query<Row>(sql, [...params])).rows)),
  };

  const admin = async <T extends Row = Row>(sql: string, params: unknown[] = []) =>
    (await db.query<T>(sql, params)).rows;

  return {
    withUser: createWithUser(driver),
    driver,
    admin,
    async migrateRest() {
      for (const name of rest) await db.exec(migrationSql(name));
      rest = [];
    },
    async createUser(email, options = {}) {
      const meta = options.timeZone === undefined ? {} : { time_zone: options.timeZone };
      const rows = await admin<{ id: string }>(
        `insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at)
         values (coalesce($1::uuid, gen_random_uuid()), $2, $3, $4) returning id`,
        [options.id ?? null, email, JSON.stringify(meta), options.confirmed ? new Date().toISOString() : null],
      );
      return rows[0].id;
    },
    close: () => db.close(),
  };
}
