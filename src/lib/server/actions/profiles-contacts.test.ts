// Tests for the actions of spec 28: set_display_name, upload_photo, remove_photo, the photo delivery,
// invite_contact, answer_invitation, withdraw_invitation, remove_contact, the badge count, and the
// People page's reading. Accepted and rejected case for each rule; a rejection changes nothing (R1).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { readPeople } from "@/lib/server/profiles/cards";
import { answerInvitation, invitationCount, removeContact, withdrawInvitation } from "./contacts";
import { deliverProfilePhoto } from "./deliver-photo";
import { inviteContact } from "./invite-contact";
import { removeProfilePhoto, uploadProfilePhoto } from "./profile-photo";
import { setDisplayName } from "./set-display-name";

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

const CROSS_SITE = { origin: "https://evil.example", "sec-fetch-site": "cross-site" };
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  postJson(path, body, { "x-forwarded-for": `10.0.0.${client}`, ...headers });

const NEUTRAL = { status: 200, body: { message: "If this person uses LockedIn, they will see your invitation." } };
const NOT_FOUND = { status: 404, body: { error: "not_found", message: "Not found" } };

const b64 = (head: number[], fill = 60) => Buffer.concat([Buffer.from(head), Buffer.alloc(fill, 7)]).toString("base64");
const JPEG = b64([0xff, 0xd8, 0xff, 0xe0]);
const PNG = b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF = b64([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

const setName = (displayName: unknown, headers?: Record<string, string>) => setDisplayName(post("/api/profile/name", { displayName }, headers), app.deps);
const upload = (body: unknown, headers?: Record<string, string>) => uploadProfilePhoto(post("/api/profile/photo", body, headers), app.deps);
const invite = (email: unknown, headers?: Record<string, string>) => inviteContact(post("/api/contacts/invite", { email }, headers), app.deps);
const answer = (id: string, accept: boolean) => answerInvitation(post(`/api/contacts/invitations/${id}/answer`, { accept }), app.deps, id);
const withdraw = (id: string) => withdrawInvitation(post(`/api/contacts/invitations/${id}/withdraw`, {}), app.deps, id);
const remove = (id: string) => removeContact(post(`/api/contacts/${id}/remove`, {}), app.deps, id);
const people = (user: string) => app.db.withUser(user, readPeople);

/** Signs in two users and makes them contacts; the session ends with `last`. */
async function contacts(): Promise<{ alice: string; bob: string }> {
  const bob = await app.signedInAs("bob@example.com");
  const alice = await app.signedInAs("alice@example.com");
  await invite("bob@example.com");
  await app.signedInAs("bob@example.com");
  await answer((await people(bob)).received[0].id, true);
  return { alice, bob };
}

describe("set_display_name", () => {
  it("saves the trimmed name; until then the part of the address before the @ is shown", async () => {
    const alice = await app.signedInAs("alice@example.com");
    expect((await people(alice)).me).toMatchObject({ displayName: null, name: "alice", email: "alice@example.com", photoUrl: null });
    expect(await read(await setName("  Alice Martins "))).toEqual({ status: 200, body: { message: "Name saved.", displayName: "Alice Martins" } });
    expect((await people(alice)).me).toMatchObject({ displayName: "Alice Martins", name: "Alice Martins" });
  });

  it("refuses an empty, too long or control-character name, another site, no session and a wrong body; nothing changes", async () => {
    expect((await setName("Alice")).status).toBe(401);
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    for (const bad of ["", "   ", "a".repeat(41), "Ali\u0007ce"]) {
      expect(await read(await setName(bad))).toEqual({
        status: 400,
        body: { error: "invalid_name", message: "Name must be 1 to 40 characters, without control characters" },
      });
    }
    expect((await setName("Alice", CROSS_SITE)).status).toBe(403);
    expect((await setName(42)).status).toBe(400);
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("upload_photo and remove_photo", () => {
  it("saves a JPEG or PNG (the type from the bytes; a claimed type is ignored) and removes it", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const saved = await read(await upload({ data: JPEG, type: "image/gif", name: "me.gif" }));
    expect(saved).toEqual({ status: 200, body: { message: "Photo saved.", photoUrl: expect.stringMatching(new RegExp(`^/api/profiles/${alice}/photo\\?v=\\d+$`)) } });
    expect((await people(alice)).me.photoUrl).toBe(saved.body.photoUrl);
    expect((await upload({ data: PNG })).status).toBe(200);
    const [row] = await app.db.admin<{ mime: string }>("select mime from app.profile_photos where user_id = $1", [alice]);
    expect(row.mime).toBe("image/png");
    expect(await read(await removeProfilePhoto(post("/api/profile/photo/remove", {}), app.deps))).toEqual({ status: 200, body: { message: "Photo removed." } });
    expect((await people(alice)).me.photoUrl).toBeNull();
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
    expect(await app.snapshot()).toEqual(before);
    // 200,000 bytes exactly fit.
    expect((await upload({ data: b64([0xff, 0xd8, 0xff], 200_000 - 3) })).status).toBe(200);
  });

  it("needs a session", async () => {
    expect((await upload({ data: JPEG })).status).toBe(401);
    expect((await removeProfilePhoto(post("/api/profile/photo/remove", {}), app.deps)).status).toBe(401);
  });
});

describe("GET /api/profiles/[id]/photo (R43)", () => {
  const PHOTO_HEADERS = {
    "content-type": "image/jpeg",
    "x-content-type-options": "nosniff",
    "content-disposition": "inline",
    "cache-control": "private, max-age=300",
    "cross-origin-resource-policy": "same-origin",
    "content-security-policy": "default-src 'none'; sandbox",
  };
  const headersOf = (response: Response) => Object.fromEntries(response.headers.entries());
  const notFoundOf = async (response: Response) => ({ status: response.status, headers: headersOf(response), body: await response.text() });

  it("serves the bytes with the stored type and the safe headers to the user and to a contact", async () => {
    const { alice } = await contacts();
    await app.signedInAs("alice@example.com");
    await upload({ data: JPEG });
    for (const viewer of ["alice@example.com", "bob@example.com"]) {
      await app.signedInAs(viewer);
      const response = await deliverProfilePhoto(app.deps, alice);
      expect(response.status).toBe(200);
      expect(headersOf(response)).toMatchObject(PHOTO_HEADERS);
      expect(Buffer.from(await response.arrayBuffer()).toString("base64")).toBe(JPEG);
    }
  });

  it("answers the same 404 for no such user, not a contact, no photo and a malformed id", async () => {
    const carol = await app.signedInAs("carol@example.com");
    const { alice, bob } = await contacts();
    await app.signedInAs("alice@example.com");
    await upload({ data: JPEG });
    await app.signedInAs("carol@example.com");
    await upload({ data: PNG });
    // Bob is Alice's contact but has no photo; Carol is nobody's contact.
    await app.signedInAs("bob@example.com");
    const answers = [
      await notFoundOf(await deliverProfilePhoto(app.deps, "00000000-0000-4000-8000-000000000000")),
      await notFoundOf(await deliverProfilePhoto(app.deps, carol)),
      await notFoundOf(await deliverProfilePhoto(app.deps, bob)),
      await notFoundOf(await deliverProfilePhoto(app.deps, "not-a-uuid")),
    ];
    await app.signedInAs("carol@example.com");
    answers.push(await notFoundOf(await deliverProfilePhoto(app.deps, alice)));
    expect(answers[0].status).toBe(404);
    expect(answers[0].body).toBe("Not found");
    for (const other of answers.slice(1)) expect(other).toEqual(answers[0]);
  });

  it("needs a session", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await upload({ data: JPEG });
    await app.auth.signOut();
    expect((await deliverProfilePhoto(app.deps, alice)).status).toBe(401);
  });
});

describe("invite_contact (R44)", () => {
  it("answers exactly the same for a new account, an unknown address, a pending one, a contact and a decline", async () => {
    const carol = await app.signedInAs("carol@example.com");
    await app.signedInAs("dave@example.com");
    const { bob } = await contacts();
    await app.signedInAs("alice@example.com");
    expect(await read(await invite("carol@example.com"))).toEqual(NEUTRAL);
    expect(await read(await invite("nobody@example.com"))).toEqual(NEUTRAL);
    expect(await read(await invite("Carol@Example.com"))).toEqual(NEUTRAL);
    expect(await read(await invite("bob@example.com"))).toEqual(NEUTRAL);
    await app.signedInAs("carol@example.com");
    expect((await answer((await people(carol)).received[0].id, false)).status).toBe(200);
    await app.signedInAs("alice@example.com");
    expect(await read(await invite("carol@example.com"))).toEqual(NEUTRAL);
    expect(await read(await invite("dave@example.com"))).toEqual(NEUTRAL);
    // Carol sees nothing more; Bob is still only a contact.
    expect((await people(carol)).received).toEqual([]);
    expect((await people(bob)).received).toEqual([]);
  });

  it("the invited user sees the inviter's name, photo and address; the inviter only the address typed and the date", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const alice = await app.signedInAs("alice@example.com");
    await setName("Alice M.");
    await upload({ data: JPEG });
    await invite("bob@example.com");
    await invite("nobody@example.com");
    const received = (await people(bob)).received;
    expect(received).toEqual([
      { id: expect.any(String), userId: alice, name: "Alice M.", email: "alice@example.com", photoUrl: expect.stringContaining(`/api/profiles/${alice}/photo?v=`), since: expect.any(String) },
    ]);
    const sent = (await people(alice)).sent;
    expect(sent.map((s) => Object.keys(s).sort())).toEqual([["email", "id", "sentAt"], ["email", "id", "sentAt"]]);
    expect(sent.map((s) => s.email).sort()).toEqual(["bob@example.com", "nobody@example.com"]);
    expect((await people(alice)).received).toEqual([]);
  });

  it("refuses the user's own address and a malformed one with their own messages; nothing changes", async () => {
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    expect(await read(await invite("ALICE@example.com"))).toEqual({ status: 400, body: { error: "invite_self", message: "You cannot invite yourself" } });
    expect(await read(await invite("not an address"))).toEqual({ status: 400, body: { error: "invalid_email", message: "Enter a valid email address" } });
    expect((await invite(42)).status).toBe(400);
    expect((await invite("bob@example.com", CROSS_SITE)).status).toBe(403);
    expect(await app.snapshot()).toEqual(before);
  });

  it("refuses the 11th invitation within an hour and the 21st open one, for any address", async () => {
    const alice = await app.signedInAs("alice@example.com");
    for (let i = 1; i <= 10; i++) expect(await read(await invite(`p${i}@example.com`))).toEqual(NEUTRAL);
    const before = await app.snapshot();
    expect(await read(await invite("p11@example.com"))).toEqual({
      status: 429,
      body: { error: "invitations_per_hour", message: "You can send at most 10 invitations per hour" },
    });
    expect(await app.snapshot()).toEqual(before);
    await app.db.admin("delete from app.contact_invite_attempts where user_id = $1", [alice]);
    // Past the in-memory brake (20 per 15 minutes); the database's own count was emptied above.
    app.advance(15 * 60_000);
    for (let i = 11; i <= 20; i++) expect(await read(await invite(`p${i}@example.com`))).toEqual(NEUTRAL);
    await app.db.admin("delete from app.contact_invite_attempts where user_id = $1", [alice]);
    expect(await read(await invite("p21@example.com"))).toEqual({
      status: 409,
      body: { error: "too_many_invitations", message: "You can have at most 20 open invitations" },
    });
  });

  it("has an in-memory brake per user as well: the 21st call within 15 minutes gets 429", async () => {
    const alice = await app.signedInAs("alice@example.com");
    for (let i = 1; i <= 20; i++) {
      // Keep the database's own limits out of the way.
      await app.db.admin("delete from app.contact_invite_attempts where user_id = $1", [alice]);
      expect((await invite("same@example.com", { "x-forwarded-for": `10.1.${client}.${i}` })).status).toBe(200);
    }
    expect(await read(await invite("same@example.com", { "x-forwarded-for": `10.2.${client}.1` }))).toEqual({
      status: 429,
      body: { error: "too_many_attempts", message: "Too many attempts. Try again in a few minutes." },
    });
    app.advance(15 * 60_000);
    expect((await invite("same@example.com", { "x-forwarded-for": `10.2.${client}.2` })).status).toBe(200);
  });

  it("accepts the other person's open invitation instead (both become contacts)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const bob = await app.signedInAs("bob@example.com");
    await invite("alice@example.com");
    await app.signedInAs("alice@example.com");
    expect(await read(await invite("bob@example.com"))).toEqual(NEUTRAL);
    expect((await people(alice)).contacts.map((c) => c.userId)).toEqual([bob]);
    expect((await people(bob)).contacts.map((c) => c.userId)).toEqual([alice]);
  });

  it("needs a session", async () => {
    expect((await invite("bob@example.com")).status).toBe(401);
  });
});

describe("answer_invitation, withdraw_invitation and remove_contact (R45, R46)", () => {
  it("accept makes both contacts, who then see each other's name, photo and address", async () => {
    const { alice, bob } = await contacts();
    expect((await people(bob)).contacts).toEqual([
      { id: expect.any(String), userId: alice, name: "alice", email: "alice@example.com", photoUrl: null, since: expect.any(String) },
    ]);
    expect((await people(alice)).contacts.map((c) => c.email)).toEqual(["bob@example.com"]);
  });

  it("decline: gone for the invited user, the inviter's list unchanged", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const alice = await app.signedInAs("alice@example.com");
    await invite("bob@example.com");
    const sent = (await people(alice)).sent;
    await app.signedInAs("bob@example.com");
    expect(await read(await answer((await people(bob)).received[0].id, false))).toEqual({ status: 200, body: { message: "Invitation declined." } });
    expect((await people(bob)).received).toEqual([]);
    expect((await people(alice)).sent).toEqual(sent);
  });

  it("answers 'Not found' for another user's invitation, a missing one and a malformed id; nothing changes", async () => {
    await app.signedInAs("carol@example.com");
    await app.signedInAs("bob@example.com");
    const alice = await app.signedInAs("alice@example.com");
    await invite("bob@example.com");
    const id = (await people(alice)).sent[0].id;
    // Alice may not answer her own invitation; Carol may not answer or withdraw it.
    const before = await app.snapshot();
    expect(await read(await answer(id, true))).toEqual(NOT_FOUND);
    await app.signedInAs("carol@example.com");
    expect(await read(await answer(id, true))).toEqual(NOT_FOUND);
    expect(await read(await withdraw(id))).toEqual(NOT_FOUND);
    expect(await read(await answer("00000000-0000-4000-8000-000000000000", false))).toEqual(NOT_FOUND);
    expect(await read(await answer("not-a-uuid", false))).toEqual(NOT_FOUND);
    expect(await read(await remove(id))).toEqual(NOT_FOUND);
    // The snapshot holds the session too; sign Alice in again before comparing.
    await app.signedInAs("alice@example.com");
    expect(await app.snapshot()).toEqual(before);
  });

  it("the sender withdraws; then it is gone for both", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const alice = await app.signedInAs("alice@example.com");
    await invite("bob@example.com");
    expect(await read(await withdraw((await people(alice)).sent[0].id))).toEqual({ status: 200, body: { message: "Invitation withdrawn." } });
    expect((await people(alice)).sent).toEqual([]);
    expect((await people(bob)).received).toEqual([]);
  });

  it("either side removes a contact; then neither sees the other, also not the photo", async () => {
    const { alice, bob } = await contacts();
    await app.signedInAs("alice@example.com");
    await upload({ data: JPEG });
    await app.signedInAs("bob@example.com");
    expect((await deliverProfilePhoto(app.deps, alice)).status).toBe(200);
    const id = (await people(bob)).contacts[0].id;
    await app.signedInAs("carol@example.com");
    expect(await read(await remove(id))).toEqual(NOT_FOUND);
    await app.signedInAs("bob@example.com");
    expect(await read(await remove(id))).toEqual({ status: 200, body: { message: "Contact removed." } });
    expect((await people(alice)).contacts).toEqual([]);
    expect((await people(bob)).contacts).toEqual([]);
    expect((await deliverProfilePhoto(app.deps, alice)).status).toBe(404);
  });

  it("the badge counts open invitations to the user", async () => {
    await app.signedInAs("carol@example.com");
    await app.signedInAs("alice@example.com");
    await invite("carol@example.com");
    await app.signedInAs("bob@example.com");
    await invite("carol@example.com");
    expect(await read(await invitationCount(app.deps))).toEqual({ status: 200, body: { count: 0 } });
    await app.signedInAs("carol@example.com");
    expect(await read(await invitationCount(app.deps))).toEqual({ status: 200, body: { count: 2 } });
    await app.auth.signOut();
    expect((await invitationCount(app.deps)).status).toBe(401);
  });
});
