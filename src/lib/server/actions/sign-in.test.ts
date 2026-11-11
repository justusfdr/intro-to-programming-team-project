// Tests for sign_in (ontology section 5, and the first half of A14). Same pattern as sign-up.test.ts:
// the accepted case checks every effect; each rejected case checks the exact message and that nothing changed.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { signIn } from "./sign-in";

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
  return signIn(postJson("/api/auth/sign-in", body, headers), app.deps);
}

/** Everything sign_in could change: rows in the database, e-mails sent and the browser's session. */
async function snapshot() {
  const [counts] = await app.db.admin(
    `select (select count(*) from auth.users)::int as users,
            (select count(*) from app.profiles)::int as profiles,
            (select count(*) from app.settings)::int as settings`,
  );
  return { ...counts, emails: app.auth.outbox.length, session: app.auth.session };
}

async function userIdOf(email: string): Promise<string> {
  const rows = await app.db.admin("select id from auth.users where email = $1", [email]);
  return (rows[0] as { id: string }).id;
}

describe("sign_in accepted", () => {
  it("signs in a confirmed account with the right password and starts a session", async () => {
    await app.auth.addUser("ana@example.com", "12345678", { confirmed: true });

    const answer = await read(await send({ email: "ana@example.com", password: "12345678" }));

    expect(answer).toEqual({ status: 200, body: { next: "/" } });
    expect(app.auth.session).toEqual({
      userId: await userIdOf("ana@example.com"),
      method: "password",
      createdAt: expect.any(Number),
    });
  });

  it("accepts the email in any letter case and with spaces around it", async () => {
    await app.auth.addUser("ben@example.com", "12345678", { confirmed: true });

    const response = await send({ email: "  Ben@Example.COM ", password: "12345678" });

    expect(response.status).toBe(200);
    expect(app.auth.session?.userId).toBe(await userIdOf("ben@example.com"));
  });
});

describe("sign_in rejected (nothing changes)", () => {
  it("answers \"Email or password is wrong\" for a wrong password and starts no session", async () => {
    await app.auth.addUser("cleo@example.com", "12345678", { confirmed: true });
    const before = await snapshot();

    const answer = await read(await send({ email: "cleo@example.com", password: "87654321" }));

    expect(answer).toEqual({ status: 401, body: { error: "wrong_credentials", message: "Email or password is wrong" } });
    expect(await snapshot()).toEqual(before);
    expect(app.auth.session).toBeNull();
  });

  it("gives a short wrong password the same message, not the length rule", async () => {
    await app.auth.addUser("eva@example.com", "12345678", { confirmed: true });

    const answer = await read(await send({ email: "eva@example.com", password: "1234567" }));

    expect(answer).toEqual({ status: 401, body: { error: "wrong_credentials", message: "Email or password is wrong" } });
    expect(app.auth.session).toBeNull();
  });

  it("answers exactly the same message for an unknown email, and starts no session", async () => {
    const before = await snapshot();

    const answer = await read(await send({ email: "nobody@example.com", password: "12345678" }));

    expect(answer).toEqual({ status: 401, body: { error: "wrong_credentials", message: "Email or password is wrong" } });
    expect(await snapshot()).toEqual(before);
    expect(app.auth.session).toBeNull();
  });

  it("answers \"Confirm your email first. We sent you a link\" for an unconfirmed account and starts no session", async () => {
    await app.auth.addUser("dan@example.com", "12345678");
    const before = await snapshot();

    const answer = await read(await send({ email: "dan@example.com", password: "12345678" }));

    expect(answer).toEqual({
      status: 403,
      body: { error: "unconfirmed", message: "Confirm your email first. We sent you a link" },
    });
    expect(await snapshot()).toEqual(before);
    expect(app.auth.isConfirmed("dan@example.com")).toBe(false);
  });

  it("rejects a request from another site (403); no session starts", async () => {
    await app.auth.addUser("fay@example.com", "12345678", { confirmed: true });
    const before = await snapshot();

    const response = await send(
      { email: "fay@example.com", password: "12345678" },
      { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    );

    expect(response.status).toBe(403);
    expect(await snapshot()).toEqual(before);
    expect(app.auth.session).toBeNull();
  });
});
