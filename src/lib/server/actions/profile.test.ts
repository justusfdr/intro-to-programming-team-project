// Tests for spec 40 on the server: save_profile, upload_photo, remove_photo, the photo delivery, the
// sidebar's own card, and the page loaders of /profile and /settings. Accepted and rejected case for
// each rule; a rejection changes nothing (R1); every answer has exactly the keys it should (an
// allow-list), so nothing else of a profile or the settings can slip out; nobody but the user ever gets
// their photo (R43).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { countingWithUser } from "@test/support/counting";
import { loadProfilePage, loadSettingsPageWithProfile } from "@/lib/server/pages/load";
import { readOwnProfile } from "@/lib/server/profiles/own-profile";
import { deliverProfilePhoto } from "./deliver-photo";
import { removeProfilePhoto, uploadProfilePhoto } from "./profile-photo";
import { ownSidebarCard, saveProfile } from "./save-profile";

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

const CROSS_SITE = { origin: "https://evil.example", "sec-fetch-site": "cross-site" };
const post = (path: string, body: unknown, headers: Record<string, string> = {}) => postJson(path, body, headers);

const save = (body: unknown, headers?: Record<string, string>) => saveProfile(post("/api/profile", body, headers), app.deps);
const upload = (body: unknown, headers?: Record<string, string>) => uploadProfilePhoto(post("/api/profile/photo", body, headers), app.deps);
const removePhoto = (headers?: Record<string, string>) => removeProfilePhoto(post("/api/profile/photo/remove", {}, headers), app.deps);
const own = (user: string) => app.db.withUser(user, readOwnProfile);

const b64 = (head: number[], fill = 60) => Buffer.concat([Buffer.from(head), Buffer.alloc(fill, 7)]).toString("base64");
const JPEG = b64([0xff, 0xd8, 0xff, 0xe0]);
const PNG = b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF = b64([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

const LINK = "https://www.linkedin.com/in/alice-martins";
const FULL = { displayName: "Alice Martins", bio: "Statistics at Nova", linkedin: "linkedin.com/in/alice-martins/" };

const NAME_ERR = { error: "invalid_name", message: "Name must be 1 to 40 characters, without control characters" };
const BIO_ERR = { error: "invalid_bio", message: "A bio must be 1 to 160 characters on one line, without control characters" };
const LINK_ERR = { error: "invalid_linkedin", message: "Enter a LinkedIn profile link, like https://www.linkedin.com/in/your-name" };

const keys = (value: object) => Object.keys(value).sort();
const CARD_KEYS = ["bio", "displayName", "email", "linkedinUrl", "name", "photoUrl", "timeZone", "userId"];

describe("save_profile", () => {
  it("saves the trimmed name, the bio and the link in its one stored form, and answers with exactly those", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const answer = await read(await save({ displayName: "  Alice Martins ", bio: " Statistics at Nova 📊 ", linkedin: "http://de.linkedin.com/in/alice-martins/" }));
    expect(answer).toEqual({
      status: 200,
      body: { message: "Profile saved.", profile: { displayName: "Alice Martins", bio: "Statistics at Nova 📊", linkedinUrl: LINK } },
    });
    const [row] = await app.db.admin("select display_name, bio, linkedin_url from app.profiles where id = $1", [alice]);
    expect(row).toEqual({ display_name: "Alice Martins", bio: "Statistics at Nova 📊", linkedin_url: LINK });
  });

  it("empty bio and link clear them; an empty name is fine only while none was ever set", async () => {
    const bob = await app.signedInAs("bob@example.com");
    expect(await read(await save({ displayName: "", bio: "Hi", linkedin: "" }))).toEqual({
      status: 200,
      body: { message: "Profile saved.", profile: { displayName: null, bio: "Hi", linkedinUrl: null } },
    });
    expect((await own(bob)).name).toBe("bob");
    await save(FULL);
    expect((await read(await save({ displayName: "Bob", bio: "  ", linkedin: " " }))).body.profile).toEqual({ displayName: "Bob", bio: null, linkedinUrl: null });
    const before = await app.snapshot();
    expect(await read(await save({ displayName: "", bio: "", linkedin: "" }))).toEqual({ status: 400, body: NAME_ERR });
    expect(await app.snapshot()).toEqual(before);
    expect((await own(bob)).name).toBe("Bob");
  });

  it("refuses each wrong field with its own code and message; nothing changes", async () => {
    await app.signedInAs("alice@example.com");
    await save(FULL);
    const before = await app.snapshot();
    const cases: Array<[Record<string, string>, object]> = [
      [{ ...FULL, displayName: "a".repeat(41) }, NAME_ERR],
      [{ ...FULL, displayName: "Ali‮ce" }, NAME_ERR],
      [{ ...FULL, displayName: "😀" }, NAME_ERR],
      [{ ...FULL, bio: "a".repeat(161) }, BIO_ERR],
      [{ ...FULL, bio: "Line one\nline two" }, BIO_ERR],
      [{ ...FULL, bio: "Hi​there" }, BIO_ERR],
      [{ ...FULL, linkedin: "javascript:alert(1)" }, LINK_ERR],
      [{ ...FULL, linkedin: "data:text/html,<script>alert(1)</script>" }, LINK_ERR],
      [{ ...FULL, linkedin: "https://evil.example/in/alice-martins" }, LINK_ERR],
      [{ ...FULL, linkedin: "https://www.linkedin.com.evil.example/in/alice-martins" }, LINK_ERR],
      [{ ...FULL, linkedin: "https://www.linkedin.com/company/lockedin" }, LINK_ERR],
      // The first wrong field in the order of the form wins.
      [{ displayName: "", bio: "\n", linkedin: "javascript:alert(1)" }, NAME_ERR],
    ];
    for (const [body, error] of cases) expect(await read(await save(body))).toEqual({ status: 400, body: error });
    expect(await app.snapshot()).toEqual(before);
  });

  it("refuses another site, no session, a wrong body and a body that is too large; nothing changes", async () => {
    expect((await save(FULL)).status).toBe(401);
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    expect((await save(FULL, CROSS_SITE)).status).toBe(403);
    expect((await save({ displayName: "Alice", bio: 42, linkedin: "" })).status).toBe(400);
    expect((await save({ displayName: "Alice" })).status).toBe(400);
    expect((await save({ ...FULL, bio: "a".repeat(17 * 1024) })).status).toBe(413);
    expect(await app.snapshot()).toEqual(before);
  });

  it("changes only the signed-in user's own row", async () => {
    const bob = await app.signedInAs("bob@example.com");
    await app.signedInAs("alice@example.com");
    await save(FULL);
    const [row] = await app.db.admin("select display_name, bio, linkedin_url from app.profiles where id = $1", [bob]);
    expect(row).toEqual({ display_name: null, bio: null, linkedin_url: null });
  });
});

describe("upload_photo and remove_photo", () => {
  it("saves a JPEG or PNG (the type from the bytes; a claimed type is ignored) and removes it", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const saved = await read(await upload({ data: JPEG, type: "image/gif", name: "me.gif" }));
    expect(saved).toEqual({ status: 200, body: { message: "Photo saved.", photoUrl: expect.stringMatching(new RegExp(`^/api/profiles/${alice}/photo\\?v=\\d+$`)) } });
    expect((await own(alice)).photoUrl).toBe(saved.body.photoUrl);
    expect((await upload({ data: PNG })).status).toBe(200);
    const [row] = await app.db.admin<{ mime: string }>("select mime from app.profile_photos where user_id = $1", [alice]);
    expect(row.mime).toBe("image/png");
    expect(await read(await removePhoto())).toEqual({ status: 200, body: { message: "Photo removed." } });
    expect((await own(alice)).photoUrl).toBeNull();
  });

  it("refuses another type, a malformed upload, more than 200,000 bytes and a body over 300 kB; nothing changes", async () => {
    await app.signedInAs("alice@example.com");
    await upload({ data: PNG });
    const before = await app.snapshot();
    const wrongType = { status: 400, body: { error: "photo_type", message: "A photo must be a JPEG, PNG or WebP image" } };
    const tooLarge = { status: 413, body: { error: "photo_size", message: "A photo can be at most 200 KB" } };
    expect(await read(await upload({ data: GIF }))).toEqual(wrongType);
    expect(await read(await upload({ data: Buffer.from("<svg onload=alert(1)>").toString("base64") }))).toEqual(wrongType);
    expect(await read(await upload({ data: "not base64!" }))).toEqual(wrongType);
    expect(await read(await upload({ data: b64([0xff, 0xd8, 0xff], 200_000 - 2) }))).toEqual(tooLarge);
    expect(await read(await upload({ data: "A".repeat(310 * 1024) }))).toEqual(tooLarge);
    expect((await upload({ photo: JPEG })).status).toBe(400);
    expect((await upload({ data: JPEG }, CROSS_SITE)).status).toBe(403);
    expect((await removePhoto(CROSS_SITE)).status).toBe(403);
    expect(await app.snapshot()).toEqual(before);
    // 200,000 bytes exactly fit.
    expect((await upload({ data: b64([0xff, 0xd8, 0xff], 200_000 - 3) })).status).toBe(200);
  });

  it("needs a session", async () => {
    expect((await upload({ data: JPEG })).status).toBe(401);
    expect((await removePhoto()).status).toBe(401);
  });

  it("removing touches only the user's own photo", async () => {
    const bob = await app.signedInAs("bob@example.com");
    await upload({ data: JPEG });
    await app.signedInAs("alice@example.com");
    await upload({ data: PNG });
    await removePhoto();
    expect(await app.db.admin("select user_id from app.profile_photos")).toEqual([{ user_id: bob }]);
  });
});

describe("GET /api/profiles/[id]/photo (R43: only the user)", () => {
  const PHOTO_HEADERS = {
    "content-type": "image/jpeg",
    "x-content-type-options": "nosniff",
    "content-disposition": "inline",
    "cache-control": "private, no-cache",
    "cross-origin-resource-policy": "same-origin",
    "content-security-policy": "default-src 'none'; sandbox",
  };
  const headersOf = (response: Response) => Object.fromEntries(response.headers.entries());
  const answerOf = async (response: Response) => ({ status: response.status, headers: headersOf(response), body: await response.text() });
  const MADE_UP = "00000000-0000-4000-8000-000000000000";

  it("serves the user's own photo with its stored type and the safe headers", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await upload({ data: JPEG });
    const response = await deliverProfilePhoto(app.deps, alice);
    expect(response.status).toBe(200);
    expect(headersOf(response)).toMatchObject(PHOTO_HEADERS);
    expect(Buffer.from(await response.arrayBuffer()).toString("base64")).toBe(JPEG);
  });

  it("answers the same 404 for a made-up id, another real user's id (with a photo), no photo and a malformed id", async () => {
    const bob = await app.signedInAs("bob@example.com");
    await upload({ data: PNG });
    const alice = await app.signedInAs("alice@example.com");
    const answers = [
      await answerOf(await deliverProfilePhoto(app.deps, MADE_UP)),
      await answerOf(await deliverProfilePhoto(app.deps, bob)),
      await answerOf(await deliverProfilePhoto(app.deps, bob.toUpperCase())),
      // Alice has no photo yet.
      await answerOf(await deliverProfilePhoto(app.deps, alice)),
      await answerOf(await deliverProfilePhoto(app.deps, "not-a-uuid")),
      await answerOf(await deliverProfilePhoto(app.deps, "' or 1=1 --")),
    ];
    expect(answers[0]).toMatchObject({ status: 404, body: "Not found" });
    expect(answers[0].headers).toMatchObject({ "cache-control": "no-store", "x-content-type-options": "nosniff" });
    expect(answers[0].headers.etag).toBeUndefined();
    for (const other of answers.slice(1)) expect(other).toEqual(answers[0]);
  });

  it("still the same 404 for another user when the database holds a contact row between the two (none can be made in this app)", async () => {
    const bob = await app.signedInAs("bob@example.com");
    await upload({ data: PNG });
    const alice = await app.signedInAs("alice@example.com");
    // Only the table's owner can write this row; it stands for rows left in a shared database.
    await app.db.admin("insert into app.contacts (user_a, user_b) values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid))", [alice, bob]);
    // The database function alone would now hand the photo out ...
    expect(await app.db.withUser(alice, (q) => q("select mime from app.profile_photo($1::uuid)", [bob]))).toEqual([{ mime: "image/png" }]);
    // ... the route does not.
    const madeUp = await answerOf(await deliverProfilePhoto(app.deps, MADE_UP));
    expect(await answerOf(await deliverProfilePhoto(app.deps, bob))).toEqual(madeUp);
    expect(madeUp.status).toBe(404);
  });

  it("asks again before each use: an ETag and an empty 304 for the current copy, never for anyone else", async () => {
    const bob = await app.signedInAs("bob@example.com");
    await upload({ data: JPEG });
    const first = await deliverProfilePhoto(app.deps, bob);
    const etag = first.headers.get("etag")!;
    expect(etag).toMatch(/^"\d+"$/);
    for (const header of [etag, `W/${etag}`, `"0", ${etag}`, "*"]) {
      const again = await deliverProfilePhoto(app.deps, bob, header);
      expect(again.status, header).toBe(304);
      expect(await again.text()).toBe("");
      expect(again.headers.get("cache-control")).toBe("private, no-cache");
    }
    // A new photo, a new tag: the old copy is not used.
    await upload({ data: PNG });
    const fresh = await deliverProfilePhoto(app.deps, bob, etag);
    expect(fresh.status).toBe(200);
    expect(fresh.headers.get("content-type")).toBe("image/png");
    // Someone else sending the tag (or "*") gets the 404, not a 304.
    await app.signedInAs("alice@example.com");
    for (const header of [fresh.headers.get("etag")!, "*"]) {
      const other = await deliverProfilePhoto(app.deps, bob, header);
      expect(other.status).toBe(404);
      expect(other.headers.get("etag")).toBeNull();
    }
  });

  it("needs a session", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await upload({ data: JPEG });
    await app.auth.signOut();
    expect((await deliverProfilePhoto(app.deps, alice)).status).toBe(401);
  });
});

describe("the sidebar's own card", () => {
  it("gives the shown name and the photo address only", async () => {
    expect((await ownSidebarCard(app.deps)).status).toBe(401);
    await app.signedInAs("alice@example.com");
    expect(await read(await ownSidebarCard(app.deps))).toEqual({ status: 200, body: { name: "alice", photoUrl: null } });
    await save(FULL);
    const answer = await read(await ownSidebarCard(app.deps));
    expect(keys(answer.body)).toEqual(["name", "photoUrl"]);
    expect(answer.body.name).toBe("Alice Martins");
  });
});

describe("the page loaders of spec 40", () => {
  it("/profile: one transaction, the user's own profile with the time zone from the settings, nothing else", async () => {
    await app.signedInAs("bob@example.com");
    await save({ displayName: "Bob", bio: "Not Alice", linkedin: "" });
    const alice = await app.signedInAs("alice@example.com", { timeZone: "America/New_York" });
    await save(FULL);
    const { withUser, transactions } = countingWithUser(app.db);
    const page = await loadProfilePage({ withUser, now: app.deps.now }, alice);
    expect(transactions).toHaveLength(1);
    expect(keys(page)).toEqual(["display", "now", "profile"]);
    expect(keys(page.profile)).toEqual(CARD_KEYS);
    expect(page.profile).toEqual({
      userId: alice,
      displayName: "Alice Martins",
      name: "Alice Martins",
      email: "alice@example.com",
      photoUrl: null,
      bio: "Statistics at Nova",
      linkedinUrl: LINK,
      timeZone: "America/New_York",
    });
    expect(page.now).toBe(app.now().toISOString());
  });

  it("/settings: the settings page's reads plus the user's own name, address and photo, nothing else", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await upload({ data: JPEG });
    const page = await loadSettingsPageWithProfile(app.deps, alice);
    expect(keys(page)).toEqual(["blocker", "display", "page", "profile"]);
    expect(keys(page.profile)).toEqual(["displayName", "email", "name", "photoUrl", "userId"]);
    expect(page.profile).toMatchObject({ userId: alice, displayName: null, name: "alice", email: "alice@example.com" });
    expect(page.profile.photoUrl).toMatch(new RegExp(`^/api/profiles/${alice}/photo\\?v=\\d+$`));
  });

  it("a link that somehow broke the rule would not be shown (checked again when read)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    // Only the table's owner could store this, and only by taking the check away first.
    await app.db.admin("alter table app.profiles drop constraint profiles_linkedin_url_form");
    try {
      await app.db.admin("update app.profiles set linkedin_url = 'javascript:alert(1)' where id = $1", [alice]);
      expect((await loadProfilePage(app.deps, alice)).profile.linkedinUrl).toBeNull();
    } finally {
      await app.db.admin("update app.profiles set linkedin_url = null where id = $1", [alice]);
      await app.db.admin(
        "alter table app.profiles add constraint profiles_linkedin_url_form check (linkedin_url is null or app.linkedin_url_valid(linkedin_url))",
      );
    }
  });
});
