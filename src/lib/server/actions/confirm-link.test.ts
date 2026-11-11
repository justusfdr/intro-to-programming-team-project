// Tests for confirm_email and reset_password, the link part (spec 01, task T1).
// Accepted cases check every effect; each rejected case checks the exact ontology message and that nothing changed.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { confirmLink } from "./confirm-link";

const PASSWORD = "12345678";
const ONE_HOUR_MS = 60 * 60 * 1000;

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

function send(body: unknown, headers?: Record<string, string>) {
  return confirmLink(postJson("/api/auth/confirm", body, headers), app.deps);
}

/** Creates an unconfirmed account and returns the token of the confirmation link sent for it. */
async function newAccount(email: string): Promise<string> {
  await app.auth.signUp({ email, password: PASSWORD, timeZone: "Europe/Lisbon" });
  const link = app.auth.lastLink(email, "confirm");
  if (!link) throw new Error("no confirmation link was sent");
  return link.tokenHash;
}

/** Asks for a reset link for a registered account and returns its token. */
async function resetLinkOf(email: string): Promise<string> {
  await app.auth.requestPasswordReset(email);
  const link = app.auth.lastLink(email, "reset");
  if (!link) throw new Error("no reset link was sent");
  return link.tokenHash;
}

async function idOf(email: string): Promise<string> {
  const [row] = await app.db.admin<{ id: string }>("select id from auth.users where email = $1", [email]);
  return row.id;
}

/** Everything the link could change: auth.users, app tables, e-mails sent and the fake browser's session. */
async function snapshot() {
  const users = await app.db.admin("select email, email_confirmed_at from auth.users order by email");
  const [counts] = await app.db.admin(
    `select (select count(*) from app.profiles)::int as profiles,
            (select count(*) from app.settings)::int as settings`,
  );
  return {
    users,
    ...counts,
    emails: app.auth.outbox.length,
    session: app.auth.session && { ...app.auth.session },
  };
}

describe("confirm_email accepted", () => {
  it("makes the account confirmed and signs the user in", async () => {
    const tokenHash = await newAccount("ana@example.com");

    const answer = await read(await send({ tokenHash, type: "email" }));

    expect(answer).toEqual({ status: 200, body: { next: "/" } });
    expect(app.auth.isConfirmed("ana@example.com")).toBe(true);
    expect(app.auth.session).toMatchObject({ userId: await idOf("ana@example.com"), method: "confirm_link" });
  });
});

describe("confirm_email rejected (nothing changes)", () => {
  it("answers 'This link has expired. Ask for a new one' for a link that was already used", async () => {
    const tokenHash = await newAccount("ben@example.com");
    expect((await read(await send({ tokenHash, type: "email" }))).status).toBe(200);
    const before = await snapshot();

    const answer = await read(await send({ tokenHash, type: "email" }));

    expect(answer).toEqual({
      status: 410,
      body: { error: "link_expired", message: "This link has expired. Ask for a new one" },
    });
    expect(await snapshot()).toEqual(before);
  });

  it("answers 'This link has expired. Ask for a new one' for a link older than one hour", async () => {
    const tokenHash = await newAccount("cleo@example.com");
    app.advance(ONE_HOUR_MS + 1000);
    const before = await snapshot();

    const answer = await read(await send({ tokenHash, type: "email" }));

    expect(answer).toEqual({
      status: 410,
      body: { error: "link_expired", message: "This link has expired. Ask for a new one" },
    });
    expect(app.auth.isConfirmed("cleo@example.com")).toBe(false);
    expect(await snapshot()).toEqual(before);
  });

  it("answers 'This link has expired. Ask for a new one' for an unknown token", async () => {
    await newAccount("dan@example.com");
    const before = await snapshot();

    const answer = await read(await send({ tokenHash: "f".repeat(32), type: "email" }));

    expect(answer).toEqual({
      status: 410,
      body: { error: "link_expired", message: "This link has expired. Ask for a new one" },
    });
    expect(await snapshot()).toEqual(before);
  });

  it("does not accept a reset link as a confirmation link; the account stays unconfirmed", async () => {
    await app.auth.addUser("eva@example.com", PASSWORD, { confirmed: false });
    const tokenHash = await resetLinkOf("eva@example.com");
    const before = await snapshot();

    const answer = await read(await send({ tokenHash, type: "email" }));

    expect(answer).toEqual({
      status: 410,
      body: { error: "link_expired", message: "This link has expired. Ask for a new one" },
    });
    expect(app.auth.isConfirmed("eva@example.com")).toBe(false);
    expect(app.auth.session).toBeNull();
    expect(await snapshot()).toEqual(before);
  });
});

describe("reset_password link", () => {
  it("a reset link that works answers next /reset-password and signs the user in", async () => {
    await app.auth.addUser("fay@example.com", PASSWORD, { confirmed: true });
    const tokenHash = await resetLinkOf("fay@example.com");

    const answer = await read(await send({ tokenHash, type: "recovery" }));

    expect(answer).toEqual({ status: 200, body: { next: "/reset-password" } });
    expect(app.auth.session).toMatchObject({ userId: await idOf("fay@example.com"), method: "reset_link" });
  });

  it("a used reset link answers 'This link has expired. Ask for a new one' and changes nothing", async () => {
    await app.auth.addUser("gus@example.com", PASSWORD, { confirmed: true });
    const tokenHash = await resetLinkOf("gus@example.com");
    expect((await read(await send({ tokenHash, type: "recovery" }))).status).toBe(200);
    const before = await snapshot();

    const answer = await read(await send({ tokenHash, type: "recovery" }));

    expect(answer).toEqual({
      status: 410,
      body: { error: "link_expired", message: "This link has expired. Ask for a new one" },
    });
    expect(await snapshot()).toEqual(before);
  });
});

describe("requests that are not allowed (nothing changes)", () => {
  it("rejects a request from another site with 403", async () => {
    const tokenHash = await newAccount("hal@example.com");
    const before = await snapshot();

    const response = await send(
      { tokenHash, type: "email" },
      { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    );

    expect(response.status).toBe(403);
    expect(await snapshot()).toEqual(before);
  });

  it("rejects a body of the wrong shape with 400, and the link still works afterwards", async () => {
    const tokenHash = await newAccount("ida@example.com");
    const before = await snapshot();

    expect((await send({})).status).toBe(400);
    expect((await send({ tokenHash: "", type: "email" })).status).toBe(400);
    expect((await send({ tokenHash: "x".repeat(201), type: "email" })).status).toBe(400);
    expect((await send({ tokenHash, type: "other" })).status).toBe(400);
    expect((await send("{not json")).status).toBe(400);
    expect(await snapshot()).toEqual(before);

    const answer = await read(await send({ tokenHash, type: "email" }));
    expect(answer).toEqual({ status: 200, body: { next: "/" } });
  });
});
