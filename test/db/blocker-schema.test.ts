// Tests for supabase/migrations/*_blocker.sql: the default list, R17 in the database, the daily cap
// on attempts, extension_seen_at only through its function, and row-level security (R3).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./harness";

let db: TestDb;
let alice: string;
let bob: string;

const DEFAULTS = ["facebook.com", "instagram.com", "reddit.com", "tiktok.com", "x.com", "youtube.com"];

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.admin("delete from auth.users");
  alice = await db.createUser("alice@example.com", { confirmed: true });
  bob = await db.createUser("bob@example.com", { confirmed: true });
});

async function sitesOf(userId: string): Promise<string[]> {
  const rows = await db.admin<{ domain: string }>("select domain from app.blocked_sites where user_id = $1 order by domain", [userId]);
  return rows.map((r) => r.domain);
}

function addAs(userId: string, domain: string) {
  return db.withUser(userId, (q) => q("insert into app.blocked_sites (domain) values ($1)", [domain]));
}

describe("the default block list", () => {
  it("gives every new account the six sites", async () => {
    expect(await sitesOf(alice)).toEqual(DEFAULTS);
  });

  it("gives accounts that existed before this file the six sites once", async () => {
    // Run the migrations up to the focus sessions file, create a user, then run the blocker file.
    const root = join(__dirname, "..", "..");
    const files = readdirSync(join(root, "supabase", "migrations")).filter((f) => f.endsWith(".sql")).sort();
    const pg = new PGlite();
    try {
      await pg.exec(readFileSync(join(__dirname, "supabase-shim.sql"), "utf8"));
      for (const file of files.filter((f) => !f.includes("blocker"))) await pg.exec(readFileSync(join(root, "supabase", "migrations", file), "utf8"));
      await pg.query("insert into auth.users (id, email) values ('11111111-1111-4111-8111-111111111111', 'old@example.com')");
      for (const file of files.filter((f) => f.includes("blocker"))) await pg.exec(readFileSync(join(root, "supabase", "migrations", file), "utf8"));
      const rows = await pg.query<{ domain: string }>("select domain from app.blocked_sites order by domain");
      expect(rows.rows.map((r) => r.domain)).toEqual(DEFAULTS);
    } finally {
      await pg.close();
    }
  });
});

describe("R17 in the database", () => {
  it.each(["Instagram.com", "www.instagram.com", "https://instagram.com", "instagram.com/reels", "localhost", "instagram", "-a.com", ""])(
    "refuses the uncleaned domain %j",
    async (domain) => {
      await expect(addAs(alice, domain)).rejects.toThrow(/blocked_sites_clean_domain/);
    },
  );

  it("refuses a duplicate", async () => {
    await expect(addAs(alice, "instagram.com")).rejects.toThrow(/blocked_sites_once_per_user/);
  });

  it("refuses a 51st site and accepts the 50th", async () => {
    for (let i = 7; i <= 50; i++) await addAs(alice, `site${i}.com`);
    expect(await sitesOf(alice)).toHaveLength(50);
    await expect(addAs(alice, "site51.com")).rejects.toThrow(/You can block at most 50 sites/);
    expect(await sitesOf(alice)).toHaveLength(50);
  });
});

describe("blocked attempts", () => {
  it("keeps attempts when the site is removed from the list", async () => {
    await db.withUser(alice, (q) => q("insert into app.blocked_attempts (domain, attempted_at) values ('instagram.com', now())"));
    await db.withUser(alice, (q) => q("delete from app.blocked_sites where domain = 'instagram.com'"));
    expect(await db.admin("select domain from app.blocked_attempts where user_id = $1", [alice])).toEqual([{ domain: "instagram.com" }]);
  });

  it("stores at most 500 per user and day and drops the rest without an error", async () => {
    await db.admin(
      `insert into app.blocked_attempts (user_id, domain, attempted_at)
       select $1, 'instagram.com', now() from generate_series(1, 499)`,
      [alice],
    );
    await db.withUser(alice, (q) =>
      q("insert into app.blocked_attempts (domain, attempted_at) select 'instagram.com', now() from generate_series(1, 5)"),
    );
    await db.withUser(bob, (q) => q("insert into app.blocked_attempts (domain, attempted_at) values ('instagram.com', now())"));
    expect(await db.admin("select user_id = $1 as alice, count(*)::int as n from app.blocked_attempts group by 1 order by 1", [alice])).toEqual([
      { alice: false, n: 1 },
      { alice: true, n: 500 },
    ]);
  });

  it("cannot be changed or deleted by the user, and another user's are not visible", async () => {
    await db.withUser(bob, (q) => q("insert into app.blocked_attempts (domain, attempted_at) values ('x.com', now())"));
    await db.withUser(alice, (q) => q("insert into app.blocked_attempts (domain, attempted_at) values ('x.com', now())"));
    await expect(db.withUser(alice, (q) => q("delete from app.blocked_attempts"))).rejects.toThrow(/permission denied/);
    await expect(db.withUser(alice, (q) => q("update app.blocked_attempts set domain = 'y.com'"))).rejects.toThrow(/permission denied/);
    expect(await db.withUser(alice, (q) => q("select user_id from app.blocked_attempts"))).toEqual([{ user_id: alice }]);
  });
});

describe("the block list belongs to its user (R3)", () => {
  it("hides another user's sites: not returned, not deleted", async () => {
    expect(await db.withUser(alice, (q) => q("select domain from app.blocked_sites where user_id = $1", [bob]))).toEqual([]);
    expect(await db.withUser(alice, (q) => q("delete from app.blocked_sites where user_id = $1 returning id", [bob]))).toEqual([]);
    expect(await sitesOf(bob)).toEqual(DEFAULTS);
  });

  it("does not let a user change a site (only add and remove)", async () => {
    await expect(db.withUser(alice, (q) => q("update app.blocked_sites set domain = 'y.com'"))).rejects.toThrow(/permission denied/);
  });
});

describe("extension_seen_at (R18)", () => {
  it("is set only through mark_extension_seen, for the signed-in user only, to the database's time", async () => {
    await db.withUser(alice, (q) => q("select app.mark_extension_seen()"));
    const rows = await db.admin<{ id: string; seen: boolean }>(
      "select id, extension_seen_at > now() - interval '1 minute' as seen from app.profiles where extension_seen_at is not null",
    );
    expect(rows).toEqual([{ id: alice, seen: true }]);
  });

  it("cannot be written directly", async () => {
    await expect(
      db.withUser(alice, (q) => q("update app.profiles set extension_seen_at = now() + interval '1 day' where id = $1", [alice])),
    ).rejects.toThrow(/permission denied/);
  });
});
