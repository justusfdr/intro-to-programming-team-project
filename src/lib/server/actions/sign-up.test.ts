// Tests for sign_up (spec 01, What lines 1 and 2). Reference pattern for action tests:
// the accepted case checks every effect; each rejected case checks the exact message and that nothing changed.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { signUp } from "./sign-up";

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
  return signUp(postJson("/api/auth/sign-up", body, headers), app.deps);
}

/** Everything sign_up could change: rows in the database and e-mails sent. */
async function snapshot() {
  const [counts] = await app.db.admin(
    `select (select count(*) from auth.users)::int as users,
            (select count(*) from app.profiles)::int as profiles,
            (select count(*) from app.settings)::int as settings`,
  );
  return { ...counts, emails: app.auth.outbox.length };
}

async function settingsOf(email: string) {
  const rows = await app.db.admin(
    `select p.plan, s.time_zone from auth.users u
       join app.profiles p on p.id = u.id
       join app.settings s on s.user_id = u.id
      where u.email = $1`,
    [email],
  );
  return rows[0];
}

describe("sign_up accepted", () => {
  it("creates an unconfirmed free account with the browser's time zone and sends a confirmation link", async () => {
    const answer = await read(
      await send({ email: "ana@example.com", password: "12345678", timeZone: "Europe/Berlin" }),
    );

    expect(answer).toEqual({ status: 201, body: { message: "We sent you a link. Open it to confirm your email." } });
    expect(app.auth.isConfirmed("ana@example.com")).toBe(false);
    expect(app.auth.lastLink("ana@example.com", "confirm")).toBeDefined();
    expect(await settingsOf("ana@example.com")).toEqual({ plan: "free", time_zone: "Europe/Berlin" });
  });

  it.each([
    ["missing", undefined],
    ["not a time zone", "Mars/Olympus_Mons"],
    ["empty", ""],
  ])("uses Europe/Lisbon when the browser's time zone is %s", async (_case, timeZone) => {
    const response = await send({ email: "ben@example.com", password: "12345678", timeZone });
    expect(response.status).toBe(201);
    expect(await settingsOf("ben@example.com")).toEqual({ plan: "free", time_zone: "Europe/Lisbon" });
  });

  it("stores the email trimmed and in lower case", async () => {
    await send({ email: "  Cleo@Example.COM ", password: "12345678" });
    expect(app.auth.hasUser("cleo@example.com")).toBe(true);
  });
});

describe("sign_up rejected (nothing is created)", () => {
  it("rejects an email that is already registered", async () => {
    await app.auth.addUser("dan@example.com", "an-old-password", { confirmed: true });
    const before = await snapshot();

    const answer = await read(await send({ email: "dan@example.com", password: "12345678" }));

    expect(answer).toEqual({ status: 409, body: { error: "email_taken", message: "This email is already registered" } });
    expect(await snapshot()).toEqual(before);
  });

  it("rejects a 7-character password", async () => {
    const before = await snapshot();

    const answer = await read(await send({ email: "eva@example.com", password: "1234567" }));

    expect(answer).toEqual({
      status: 400,
      body: { error: "password_too_short", message: "Password needs at least 8 characters" },
    });
    expect(await snapshot()).toEqual(before);
    expect(app.auth.hasUser("eva@example.com")).toBe(false);
  });

  it("rejects an address that is not an email", async () => {
    const before = await snapshot();
    const answer = await read(await send({ email: "not an email", password: "12345678" }));
    expect(answer.status).toBe(400);
    expect(answer.body.message).toBe("Enter a valid email address");
    expect(await snapshot()).toEqual(before);
  });

  it("rejects a request from another site", async () => {
    const before = await snapshot();
    const response = await send(
      { email: "fay@example.com", password: "12345678" },
      { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    );
    expect(response.status).toBe(403);
    expect(await snapshot()).toEqual(before);
  });

  it("rejects a body of the wrong shape or size", async () => {
    const before = await snapshot();
    expect((await send({ email: "gus@example.com" })).status).toBe(400);
    expect((await send("{not json")).status).toBe(400);
    expect((await send({ email: "gus@example.com", password: "x".repeat(20_000) })).status).toBe(413);
    expect(await snapshot()).toEqual(before);
  });

  it("answers with the ontology's message when the e-mail cannot be sent, and creates nothing", async () => {
    app.auth.emailDown = true;
    const before = await snapshot();

    const answer = await read(await send({ email: "hal@example.com", password: "12345678" }));

    expect(answer).toEqual({
      status: 503,
      body: { error: "email_failed", message: "We could not send the email. Try again later" },
    });
    expect(await snapshot()).toEqual(before);
  });
});

describe("sign_up again before confirming", () => {
  // Supabase's behaviour with confirmation on: no second account, a new link. Reported to the advisor.
  it("sends a new link and keeps the one account", async () => {
    await send({ email: "ida@example.com", password: "12345678" });
    const response = await send({ email: "ida@example.com", password: "12345678" });

    expect(response.status).toBe(201);
    const [row] = await app.db.admin("select count(*)::int as n from auth.users where email = $1", ["ida@example.com"]);
    expect(row).toEqual({ n: 1 });
    expect(app.auth.outbox.filter((mail) => mail.to === "ida@example.com")).toHaveLength(2);
  });
});
