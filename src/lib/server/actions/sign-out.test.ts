// Tests for sign_out (ontology section 5). Same pattern as sign-up.test.ts:
// the accepted case checks the effect; the rejected case checks that nothing changed.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { signOut } from "./sign-out";

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

function send(headers?: Record<string, string>) {
  return signOut(postJson("/api/auth/sign-out", {}, headers), app.deps);
}

/** Signs a confirmed account in, the way sign_in does, so that there is a session to end. */
async function signedIn() {
  await app.auth.addUser("ana@example.com", "12345678", { confirmed: true });
  await app.auth.signIn({ email: "ana@example.com", password: "12345678" });
  expect(app.auth.session).not.toBeNull();
}

describe("sign_out", () => {
  it("ends the session and answers where to go next", async () => {
    await signedIn();

    const answer = await read(await send());

    expect(answer).toEqual({ status: 200, body: { next: "/sign-in" } });
    expect(app.auth.session).toBeNull();
  });

  it("still answers 200 without a session", async () => {
    expect(app.auth.session).toBeNull();

    const answer = await read(await send());

    expect(answer).toEqual({ status: 200, body: { next: "/sign-in" } });
    expect(app.auth.session).toBeNull();
  });

  it("rejects a request from another site (403); the session stays", async () => {
    await signedIn();
    const before = app.auth.session;

    const response = await send({ origin: "https://evil.example", "sec-fetch-site": "cross-site" });

    expect(response.status).toBe(403);
    expect(app.auth.session).toEqual(before);
  });
});
