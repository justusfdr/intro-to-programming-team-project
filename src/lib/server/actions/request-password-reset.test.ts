// Tests for request_password_reset (spec 01, task T4).
// Accepted cases check every effect; each rejected case checks the exact ontology message and that nothing changed.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { requestPasswordReset } from "./request-password-reset";

const PASSWORD = "12345678";
const NEUTRAL = "If this email is registered, we sent a link";

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
  return requestPasswordReset(postJson("/api/auth/request-password-reset", body, headers), app.deps);
}

/** Everything the request could change: auth.users, app tables, e-mails sent and the fake browser's session. */
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

describe("request_password_reset accepted", () => {
  it("sends a registered email a reset link and answers with the neutral message", async () => {
    await app.auth.addUser("ana@example.com", PASSWORD, { confirmed: true });

    const answer = await read(await send({ email: "ana@example.com" }));

    expect(answer).toEqual({ status: 200, body: { message: "If this email is registered, we sent a link" } });
    expect(app.auth.outbox).toHaveLength(1);
    expect(app.auth.lastLink("ana@example.com", "reset")).toBeDefined();
  });

  it("gives an unknown address the same neutral message and sends no e-mail (A14)", async () => {
    await app.auth.addUser("dan@example.com", PASSWORD, { confirmed: true });

    const registered = await read(await send({ email: "dan@example.com" }));
    const outboxAfterRegistered = app.auth.outbox.length;
    const unknown = await read(await send({ email: "nobody@example.com" }));

    expect(unknown).toEqual(registered);
    expect(unknown).toEqual({ status: 200, body: { message: NEUTRAL } });
    expect(app.auth.outbox).toHaveLength(outboxAfterRegistered);
    expect(app.auth.outbox.some((mail) => mail.to === "nobody@example.com")).toBe(false);
  });

  it("gives an unconfirmed account the neutral message", async () => {
    await app.auth.addUser("eva@example.com", PASSWORD);

    const answer = await read(await send({ email: "eva@example.com" }));

    expect(answer).toEqual({ status: 200, body: { message: "If this email is registered, we sent a link" } });
  });

  it("gives an address that is not an email the same neutral message and sends nothing", async () => {
    const before = await snapshot();

    const answer = await read(await send({ email: "not an email" }));

    expect(answer).toEqual({ status: 200, body: { message: NEUTRAL } });
    expect(await snapshot()).toEqual(before);
  });
});

describe("request_password_reset rejected (nothing changes)", () => {
  it("answers 'We could not send the email. Try again later' when e-mail is down, and sends nothing", async () => {
    await app.auth.addUser("fay@example.com", PASSWORD, { confirmed: true });
    app.auth.emailDown = true;
    const before = await snapshot();

    const answer = await read(await send({ email: "fay@example.com" }));

    expect(answer).toEqual({
      status: 503,
      body: { error: "email_failed", message: "We could not send the email. Try again later" },
    });
    expect(await snapshot()).toEqual(before);
  });

  it("rejects a request from another site (403); nothing sent", async () => {
    await app.auth.addUser("gus@example.com", PASSWORD, { confirmed: true });
    const before = await snapshot();

    const response = await send(
      { email: "gus@example.com" },
      { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    );

    expect(response.status).toBe(403);
    expect(await snapshot()).toEqual(before);
  });
});
