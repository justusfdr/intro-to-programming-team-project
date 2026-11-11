// Tests for resend_confirmation (spec 01, task T2).
// Accepted cases check every effect; each rejected case checks the exact ontology message and that nothing changed.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { resendConfirmation } from "./resend-confirmation";

const PASSWORD = "12345678";

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
  return resendConfirmation(postJson("/api/auth/resend-confirmation", body, headers), app.deps);
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

describe("resend_confirmation accepted", () => {
  it("sends an unconfirmed account a new link and answers with the neutral message", async () => {
    await app.auth.addUser("ana@example.com", PASSWORD);

    const answer = await read(await send({ email: "ana@example.com" }));

    expect(answer).toEqual({ status: 200, body: { message: "If this email needs confirming, we sent a link" } });
    expect(app.auth.outbox).toHaveLength(1);
    expect(app.auth.lastLink("ana@example.com", "confirm")).toBeDefined();
    expect(app.auth.isConfirmed("ana@example.com")).toBe(false);
  });

  it("gives a confirmed and an unknown address the same neutral message and sends no e-mail", async () => {
    await app.auth.addUser("dan@example.com", PASSWORD, { confirmed: true });

    const confirmed = await read(await send({ email: "dan@example.com" }));
    const unknown = await read(await send({ email: "nobody@example.com" }));

    expect(confirmed).toEqual({ status: 200, body: { message: "If this email needs confirming, we sent a link" } });
    expect(unknown).toEqual(confirmed);
    expect(app.auth.outbox).toHaveLength(0);
  });
});

describe("resend_confirmation rejected (nothing changes)", () => {
  it("answers 'Please wait a minute before asking again' when asked again within 60 seconds, and sends nothing", async () => {
    await app.auth.addUser("eva@example.com", PASSWORD);
    expect((await read(await send({ email: "eva@example.com" }))).status).toBe(200);
    const before = await snapshot();

    const answer = await read(await send({ email: "eva@example.com" }));

    expect(answer).toEqual({ status: 429, body: { error: "too_soon", message: "Please wait a minute before asking again" } });
    expect(await snapshot()).toEqual(before);
  });

  it("accepts a new request again after 60 seconds", async () => {
    await app.auth.addUser("fay@example.com", PASSWORD);
    expect((await read(await send({ email: "fay@example.com" }))).status).toBe(200);

    app.advance(60_000);
    const answer = await read(await send({ email: "fay@example.com" }));

    expect(answer).toEqual({ status: 200, body: { message: "If this email needs confirming, we sent a link" } });
    expect(app.auth.outbox).toHaveLength(2);
  });

  it("answers 'We could not send the email. Try again later' when e-mail is down, and sends nothing", async () => {
    await app.auth.addUser("gus@example.com", PASSWORD);
    app.auth.emailDown = true;
    const before = await snapshot();

    const answer = await read(await send({ email: "gus@example.com" }));

    expect(answer).toEqual({
      status: 503,
      body: { error: "email_failed", message: "We could not send the email. Try again later" },
    });
    expect(await snapshot()).toEqual(before);
  });

  it("rejects a request from another site (403); nothing sent", async () => {
    await app.auth.addUser("hal@example.com", PASSWORD);
    const before = await snapshot();

    const response = await send(
      { email: "hal@example.com" },
      { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    );

    expect(response.status).toBe(403);
    expect(await snapshot()).toEqual(before);
  });
});
