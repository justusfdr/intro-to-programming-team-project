// Tests for the server side of the security review of sharing (spec 53, from specs 28 and 30): the photo
// is never kept in the browser without asking again (fix 5), and a display name needs a letter or digit
// and no invisible characters (fix 3). Accepted and rejected case each; a refusal changes nothing (R1).
// The name is set with main's save_profile (spec 40); there is no set_display_name.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { readPeople } from "@/lib/server/profiles/cards";
import { answerInvitation } from "./contacts";
import { deliverProfilePhoto } from "./deliver-photo";
import { inviteContact } from "./invite-contact";
import { uploadProfilePhoto } from "./profile-photo";
import { saveProfile } from "./save-profile";

let app: TestApp;
let client = 0;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.reset();
  // The in-memory brake of invite_contact counts per client address; each test is its own client.
  client += 1;
});

const post = (path: string, body: unknown) => postJson(path, body, { "x-forwarded-for": `10.0.1.${client}` });
const b64 = (head: number[], fill = 60) => Buffer.concat([Buffer.from(head), Buffer.alloc(fill, 7)]).toString("base64");
const JPEG = b64([0xff, 0xd8, 0xff, 0xe0]);
const PNG = b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const upload = (data: string) => uploadProfilePhoto(post("/api/profile/photo", { data }), app.deps);
const people = (user: string) => app.db.withUser(user, readPeople);

/** Makes Alice and Bob contacts through the actions; the session ends with Alice. Returns the contact row. */
async function contacts(): Promise<{ alice: string; bob: string; contactId: string }> {
  const bob = await app.signedInAs("bob@example.com");
  const alice = await app.signedInAs("alice@example.com");
  await inviteContact(post("/api/contacts/invite", { email: "bob@example.com" }), app.deps);
  await app.signedInAs("bob@example.com");
  const id = (await people(bob)).received[0].id;
  await answerInvitation(post(`/api/contacts/invitations/${id}/answer`, { accept: true }), app.deps, id);
  await app.signedInAs("alice@example.com");
  return { alice, bob, contactId: (await people(alice)).contacts[0].id };
}

describe("GET /api/profiles/[id]/photo: no copy kept without asking (fix 5)", () => {
  it("answers private, no-cache with an ETag, and an empty 304 when the browser's copy is current", async () => {
    const { alice } = await contacts();
    await upload(JPEG);
    await app.signedInAs("bob@example.com");
    const first = await deliverProfilePhoto(app.deps, alice);
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("private, no-cache");
    const etag = first.headers.get("etag")!;
    expect(etag).toMatch(/^"\d+"$/);

    for (const header of [etag, `W/${etag}`, `"0", ${etag}`, "*"]) {
      const again = await deliverProfilePhoto(app.deps, alice, header);
      expect(again.status, header).toBe(304);
      expect(await again.text()).toBe("");
      expect(again.headers.get("etag")).toBe(etag);
      expect(again.headers.get("cache-control")).toBe("private, no-cache");
      expect(again.headers.get("x-content-type-options")).toBe("nosniff");
    }

    // Another tag: the photo itself.
    const other = await deliverProfilePhoto(app.deps, alice, '"0"');
    expect(other.status).toBe(200);
    expect(Buffer.from(await other.arrayBuffer()).toString("base64")).toBe(JPEG);
  });

  it("a new photo gets a new ETag, so the old copy is not used", async () => {
    const { alice } = await contacts();
    await upload(JPEG);
    const old = (await deliverProfilePhoto(app.deps, alice)).headers.get("etag")!;
    await upload(PNG);
    const fresh = await deliverProfilePhoto(app.deps, alice, old);
    expect(fresh.status).toBe(200);
    expect(fresh.headers.get("content-type")).toBe("image/png");
    expect(fresh.headers.get("etag")).not.toBe(old);
  });

  it("the ETag gives no 304 without permission: a stranger and a removed contact get the same 404", async () => {
    const { alice, bob, contactId } = await contacts();
    await upload(JPEG);
    const etag = (await deliverProfilePhoto(app.deps, alice)).headers.get("etag")!;
    await app.signedInAs("carol@example.com");
    const stranger = await deliverProfilePhoto(app.deps, alice, etag);
    expect(stranger.status).toBe(404);
    expect(stranger.headers.get("etag")).toBeNull();
    expect(stranger.headers.get("cache-control")).toBe("no-store");

    await app.signedInAs("bob@example.com");
    expect((await deliverProfilePhoto(app.deps, alice, etag)).status).toBe(304);
    await app.db.withUser(bob, (q) => q("select app.remove_contact($1::uuid)", [contactId]));
    const removed = await deliverProfilePhoto(app.deps, alice, etag);
    expect(removed.status).toBe(404);
    expect(await removed.text()).toBe("Not found");
  });
});

describe("save_profile's name: a letter or digit, nothing invisible (fix 3)", () => {
  it("accepts a name with letters and refuses an emoji alone and a blank filler, changing nothing", async () => {
    await app.signedInAs("alice@example.com");
    const setName = (displayName: string) => saveProfile(post("/api/profile", { displayName, bio: "", linkedin: "" }), app.deps);
    expect((await setName("Lea 😀")).status).toBe(200);
    const before = await app.snapshot();
    for (const bad of ["😀", "ㅤ", "Lea­Martins"]) {
      expect(await read(await setName(bad))).toEqual({
        status: 400,
        body: { error: "invalid_name", message: "Name must be 1 to 40 characters, without control characters" },
      });
    }
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("GET /api/profiles/[id]/photo follows R43 exactly (E3)", () => {
  const MADE_UP = "00000000-0000-4000-8000-000000000000";
  const answerOf = async (response: Response) => ({
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.text(),
  });

  it("the same 404 as a made-up id for two people who are not contacts but share an event invitation or a list", async () => {
    // Ana invited Ben and Carl to one event (rows of the old event invitations, not written by this app);
    // Ben and Carl are not contacts. app.may_see_profile (behind app.profile_photo) would let them see
    // each other's photo; the route must not.
    const carl = await app.signedInAs("carl@example.com");
    await upload(PNG);
    const ben = await app.signedInAs("ben@example.com");
    await upload(JPEG);
    const ana = await app.signedInAs("ana@example.com");
    const pair = (a: string, b: string) =>
      app.db.admin<{ id: string }>(
        "insert into app.contacts (user_a, user_b) values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid)) returning id",
        [a, b],
      );
    const [anaBen] = await pair(ana, ben);
    const [anaCarl] = await pair(ana, carl);
    const [event] = await app.db.admin<{ id: string }>(
      "insert into app.events (user_id, title, start_at, end_at) values ($1, 'Group work', '2026-11-17T09:00:00Z', '2026-11-17T10:00:00Z') returning id",
      [ana],
    );
    await app.db.admin(
      "insert into app.event_invites (event_id, contact_id, owner, invitee) values ($1, $2, $3, $4), ($1, $5, $3, $6)",
      [event.id, anaBen.id, ana, ben, anaCarl.id, carl],
    );
    // A list of Ana's with both as members, too.
    const [list] = await app.db.admin<{ id: string }>("insert into app.lists (owner, title) values ($1, 'Groceries') returning id", [ana]);
    await app.db.admin("insert into app.list_members (list_id, user_id, contact_id) values ($1, $2, $3), ($1, $4, $5)", [
      list.id,
      ben,
      anaBen.id,
      carl,
      anaCarl.id,
    ]);

    // The database function alone would hand the photo out ...
    expect(await app.db.withUser(ben, (q) => q("select mime from app.profile_photo($1::uuid)", [carl]))).toEqual([{ mime: "image/png" }]);
    // ... the route does not: for both, the very same answer as for a made-up id, also with an ETag.
    await app.signedInAs("ben@example.com");
    const madeUp = await answerOf(await deliverProfilePhoto(app.deps, MADE_UP));
    expect(madeUp.status).toBe(404);
    expect(await answerOf(await deliverProfilePhoto(app.deps, carl))).toEqual(madeUp);
    expect(await answerOf(await deliverProfilePhoto(app.deps, carl, "*"))).toEqual(madeUp);
    await app.signedInAs("carl@example.com");
    expect(await answerOf(await deliverProfilePhoto(app.deps, ben))).toEqual(madeUp);
    // Ana, a contact of both, does get them.
    await app.signedInAs("ana@example.com");
    expect((await deliverProfilePhoto(app.deps, carl)).status).toBe(200);
    expect((await deliverProfilePhoto(app.deps, ben)).status).toBe(200);
  });

  it("owner, contact, stranger: the stranger and a removed contact get the very answer of a made-up id", async () => {
    const { alice, contactId } = await contacts();
    await upload(JPEG);
    await app.signedInAs("carol@example.com");
    const madeUp = await answerOf(await deliverProfilePhoto(app.deps, MADE_UP));
    expect(await answerOf(await deliverProfilePhoto(app.deps, alice))).toEqual(madeUp);
    await app.signedInAs("bob@example.com");
    expect((await deliverProfilePhoto(app.deps, alice)).status).toBe(200);
    await app.db.withUser(alice, (q) => q("select app.remove_contact($1::uuid)", [contactId]));
    expect(await answerOf(await deliverProfilePhoto(app.deps, alice))).toEqual(madeUp);
    expect(await answerOf(await deliverProfilePhoto(app.deps, MADE_UP))).toEqual(madeUp);
  });
});
