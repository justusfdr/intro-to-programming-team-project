// Tests for add_blocked_site and remove_blocked_site (spec 05, What lines 1 to 4).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { attemptsOf, DEFAULT_SITES, sitesOf } from "@test/support/blocker";
import { addBlockedSite } from "./add-blocked-site";
import { removeBlockedSite } from "./remove-blocked-site";

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

function add(domain: unknown, headers?: Record<string, string>) {
  return addBlockedSite(postJson("/api/blocked-sites", { domain }, headers), app.deps);
}

function remove(id: string, headers?: Record<string, string>) {
  return removeBlockedSite(postJson(`/api/blocked-sites/${id}/remove`, {}, headers), app.deps, id);
}

async function idOf(userId: string, domain: string): Promise<string> {
  const [row] = await app.db.admin<{ id: string }>("select id from app.blocked_sites where user_id = $1 and domain = $2", [userId, domain]);
  return row.id;
}

describe("the default list and add_blocked_site", () => {
  it("starts a new account with the six default sites", async () => {
    const alice = await app.signedInAs("alice@example.com");
    expect(await sitesOf(app.db, alice)).toEqual(DEFAULT_SITES);
  });

  it("saves 'https://www.Instagram.com/reels' as 'instagram.com' (R17) once it is not listed", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await remove(await idOf(alice, "instagram.com"));
    const answer = await read(await add("https://www.Instagram.com/reels"));
    expect(answer).toMatchObject({ status: 201, body: { message: "Added to your block list.", site: { domain: "instagram.com" } } });
    expect(await sitesOf(app.db, alice)).toContain("instagram.com");
  });

  it("adds a new site such as news.ycombinator.com", async () => {
    const alice = await app.signedInAs("alice@example.com");
    expect((await add("news.ycombinator.com")).status).toBe(201);
    expect(await sitesOf(app.db, alice)).toHaveLength(7);
  });
});

describe("add_blocked_site rejected: nothing is saved (R1)", () => {
  it("rejects 'not a site' with 'This is not a valid website' (A10)", async () => {
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    expect(await read(await add("not a site"))).toEqual({ status: 400, body: { error: "invalid_site", message: "This is not a valid website" } });
    expect(await app.snapshot()).toEqual(before);
  });

  it("rejects a listed domain in any spelling with 'Already on your list'", async () => {
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    for (const spelling of ["instagram.com", "https://www.INSTAGRAM.com/explore"]) {
      expect(await read(await add(spelling))).toEqual({ status: 409, body: { error: "already_listed", message: "Already on your list" } });
    }
    expect(await app.snapshot()).toEqual(before);
  });

  it("rejects a 51st site with 'You can block at most 50 sites'", async () => {
    const alice = await app.signedInAs("alice@example.com");
    for (let i = 7; i <= 50; i++) expect((await add(`site${i}.com`)).status).toBe(201);
    const before = await app.snapshot();
    expect(await read(await add("site51.com"))).toEqual({ status: 409, body: { error: "too_many_sites", message: "You can block at most 50 sites" } });
    expect(await app.snapshot()).toEqual(before);
    expect(await sitesOf(app.db, alice)).toHaveLength(50);
  });

  it("rejects no session (401), another site (403) and a wrong body (400)", async () => {
    const before = await app.snapshot();
    expect((await add("example.com")).status).toBe(401);
    expect(await app.snapshot()).toEqual(before);
    await app.signedInAs("alice@example.com");
    const signedIn = await app.snapshot();
    expect((await add("example.com", { origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await add(42)).status).toBe(400);
    expect(await app.snapshot()).toEqual(signedIn);
  });
});

describe("remove_blocked_site", () => {
  it("removes the site and keeps its past attempts", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await app.db.admin("insert into app.blocked_attempts (user_id, domain, attempted_at) values ($1, 'x.com', '2026-11-16T08:00:00Z')", [alice]);
    expect(await read(await remove(await idOf(alice, "x.com")))).toEqual({ status: 200, body: { message: "Removed from your block list." } });
    expect(await sitesOf(app.db, alice)).not.toContain("x.com");
    expect(await attemptsOf(app.db, alice)).toEqual([{ domain: "x.com", attemptedAt: "2026-11-16T08:00:00.000Z" }]);
  });

  it("answers exactly the same 'Not found' for another user's site, a missing site and a malformed id, and changes nothing (R3)", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const bobs = await idOf(bob, "x.com");
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();

    const othersSite = await read(await remove(bobs));
    const missing = await read(await remove("00000000-0000-4000-8000-000000000000"));
    const malformed = await read(await remove("not-a-uuid"));

    expect(othersSite).toEqual({ status: 404, body: { error: "not_found", message: "Not found" } });
    expect(missing).toEqual(othersSite);
    expect(malformed).toEqual(othersSite);
    expect(await app.snapshot()).toEqual(before);
  });

  it("rejects another site (403); unchanged", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    expect((await remove(await idOf(alice, "x.com"), { origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect(await app.snapshot()).toEqual(before);
  });
});
