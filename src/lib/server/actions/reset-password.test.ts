// Tests for reset_password, the new-password part (spec 01, task T5). Needs the link part of T1 (confirm-link.ts).
// Accepted cases check every effect; each rejected case checks the exact ontology message and that nothing changed.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { confirmLink } from "./confirm-link";
import { resetPassword } from "./reset-password";
import { signIn } from "./sign-in";

const OLD_PASSWORD = "12345678";
const NEW_PASSWORD = "new-password-1";
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

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
  return resetPassword(postJson("/api/auth/reset-password", body, headers), app.deps);
}

/** Opens a reset link for a registered account, the way the confirm page does, so the browser has its session. */
async function openResetLink(email: string): Promise<void> {
  await app.auth.requestPasswordReset(email);
  const link = app.auth.lastLink(email, "reset");
  if (!link) throw new Error("no reset link was sent");
  const answer = await read(
    await confirmLink(postJson("/api/auth/confirm", { tokenHash: link.tokenHash, type: "recovery" }), app.deps),
  );
  if (answer.status !== 200) throw new Error(`the reset link did not work: ${answer.status}`);
}

/** Everything reset_password could change: auth.users, app tables, e-mails sent and the fake browser's session. */
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

async function signInWith(email: string, password: string): Promise<number> {
  const answer = await read(await signIn(postJson("/api/auth/sign-in", { email, password }), app.deps));
  return answer.status;
}

describe("reset_password accepted", () => {
  it("after the reset link, the new password works for sign_in, the old one does not, and the session has ended", async () => {
    await app.auth.addUser("ana@example.com", OLD_PASSWORD, { confirmed: true });
    await openResetLink("ana@example.com");

    const answer = await read(await send({ password: NEW_PASSWORD }));

    expect(answer).toEqual({ status: 200, body: { next: "/sign-in" } });
    expect(app.auth.session).toBeNull();
    expect(await signInWith("ana@example.com", OLD_PASSWORD)).toBe(401);
    expect(await signInWith("ana@example.com", NEW_PASSWORD)).toBe(200);
  });
});

describe("reset_password rejected (nothing changes)", () => {
  it("rejects a 7-character password with 'Password needs at least 8 characters'; the old password still works", async () => {
    await app.auth.addUser("ben@example.com", OLD_PASSWORD, { confirmed: true });
    await openResetLink("ben@example.com");
    const before = await snapshot();

    const answer = await read(await send({ password: "1234567" }));

    expect(answer).toEqual({
      status: 400,
      body: { error: "password_too_short", message: "Password needs at least 8 characters" },
    });
    expect(await snapshot()).toEqual(before);
    expect(await signInWith("ben@example.com", OLD_PASSWORD)).toBe(200);
  });

  it("without any session answers 'This link has expired. Ask for a new one'", async () => {
    await app.auth.addUser("cleo@example.com", OLD_PASSWORD, { confirmed: true });
    const before = await snapshot();

    const answer = await read(await send({ password: NEW_PASSWORD }));

    expect(answer).toEqual({
      status: 410,
      body: { error: "link_expired", message: "This link has expired. Ask for a new one" },
    });
    expect(await snapshot()).toEqual(before);
    expect(await signInWith("cleo@example.com", OLD_PASSWORD)).toBe(200);
  });

  it("a normal signed-in session cannot set a new password: 'This link has expired. Ask for a new one'", async () => {
    await app.auth.addUser("dan@example.com", OLD_PASSWORD, { confirmed: true });
    expect(await signInWith("dan@example.com", OLD_PASSWORD)).toBe(200);
    const before = await snapshot();

    const answer = await read(await send({ password: NEW_PASSWORD }));

    expect(answer).toEqual({
      status: 410,
      body: { error: "link_expired", message: "This link has expired. Ask for a new one" },
    });
    expect(await snapshot()).toEqual(before);
    expect(await signInWith("dan@example.com", OLD_PASSWORD)).toBe(200);
  });

  it("the reset link's session can set a new password only within 15 minutes: after 15 minutes it answers 'This link has expired. Ask for a new one'", async () => {
    await app.auth.addUser("eva@example.com", OLD_PASSWORD, { confirmed: true });
    await openResetLink("eva@example.com");
    app.advance(FIFTEEN_MINUTES_MS + 1000);
    const before = await snapshot();

    const answer = await read(await send({ password: NEW_PASSWORD }));

    expect(answer).toEqual({
      status: 410,
      body: { error: "link_expired", message: "This link has expired. Ask for a new one" },
    });
    expect(await snapshot()).toEqual(before);
    expect(await signInWith("eva@example.com", OLD_PASSWORD)).toBe(200);
  });

  it("the reset link's session can set a new password within 15 minutes: at 14 minutes it works", async () => {
    await app.auth.addUser("fay@example.com", OLD_PASSWORD, { confirmed: true });
    await openResetLink("fay@example.com");
    app.advance(14 * 60 * 1000);

    const answer = await read(await send({ password: NEW_PASSWORD }));

    expect(answer).toEqual({ status: 200, body: { next: "/sign-in" } });
    expect(await signInWith("fay@example.com", NEW_PASSWORD)).toBe(200);
  });

  it("using the same reset link a second time answers 'This link has expired. Ask for a new one' (through confirm-link)", async () => {
    await app.auth.addUser("gus@example.com", OLD_PASSWORD, { confirmed: true });
    await app.auth.requestPasswordReset("gus@example.com");
    const link = app.auth.lastLink("gus@example.com", "reset");
    if (!link) throw new Error("no reset link was sent");
    const linkBody = { tokenHash: link.tokenHash, type: "recovery" };
    expect((await read(await confirmLink(postJson("/api/auth/confirm", linkBody), app.deps))).status).toBe(200);

    // Someone opens the same link again in a browser without a session.
    app.auth.session = null;
    const before = await snapshot();
    const second = await read(await confirmLink(postJson("/api/auth/confirm", linkBody), app.deps));

    expect(second).toEqual({
      status: 410,
      body: { error: "link_expired", message: "This link has expired. Ask for a new one" },
    });
    expect(await snapshot()).toEqual(before);
    expect(await read(await send({ password: NEW_PASSWORD }))).toEqual({
      status: 410,
      body: { error: "link_expired", message: "This link has expired. Ask for a new one" },
    });
    expect(await signInWith("gus@example.com", OLD_PASSWORD)).toBe(200);
  });

  it("rejects a request from another site (403); the password is unchanged", async () => {
    await app.auth.addUser("hal@example.com", OLD_PASSWORD, { confirmed: true });
    await openResetLink("hal@example.com");
    const before = await snapshot();

    const response = await send(
      { password: NEW_PASSWORD },
      { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    );

    expect(response.status).toBe(403);
    expect(await snapshot()).toEqual(before);
    expect(await signInWith("hal@example.com", OLD_PASSWORD)).toBe(200);
  });
});
