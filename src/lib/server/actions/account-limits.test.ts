// Tests for the rate limits of the account actions (Issue #46, spec 50): per e-mail address and per client
// address, 15-minute window, answered with 429 and the same message whatever the address. The counts
// live in the module's memory for the whole file, so every test uses its own addresses and client.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { clientAddress } from "./account-limits";
import { requestPasswordReset } from "./request-password-reset";
import { resendConfirmation } from "./resend-confirmation";
import { signIn } from "./sign-in";
import { signUp } from "./sign-up";

const TOO_MANY = { status: 429, body: { error: "too_many_attempts", message: "Too many attempts. Try again in a few minutes." } };
const FIFTEEN_MINUTES = 15 * 60_000;

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.reset();
  vi.restoreAllMocks();
});

const from = (client: string) => ({ "x-forwarded-for": `${client}, 10.0.0.1` });

const signInAs = (email: string, client: string) =>
  signIn(postJson("/api/auth/sign-in", { email, password: "wrong-password" }, from(client)), app.deps);
const reset = (email: string, client: string) =>
  requestPasswordReset(postJson("/api/auth/request-password-reset", { email }, from(client)), app.deps);
const resend = (email: string, client: string) =>
  resendConfirmation(postJson("/api/auth/resend-confirmation", { email }, from(client)), app.deps);
const register = (email: string, client: string) =>
  signUp(postJson("/api/auth/sign-up", { email, password: "12345678" }, from(client)), app.deps);

const signInRight = (email: string, client: string) =>
  signIn(postJson("/api/auth/sign-in", { email, password: "12345678" }, from(client)), app.deps);

// Spec 50: only wrong passwords count, at most 10 per address from one client and 50 per address from
// all clients, so a stranger cannot lock a person out of their account.
describe("sign_in: at most 10 wrong passwords per address and client per 15 minutes", () => {
  it("refuses the 11th from that client without asking the sign-in service; another address is not affected; works again after the window", async () => {
    await app.auth.addUser("ana@example.com", "12345678", { confirmed: true });
    const service = vi.spyOn(app.auth, "signIn");
    for (let i = 1; i <= 10; i++) expect((await signInAs("ana@example.com", "198.51.100.1")).status, `try ${i}`).toBe(401);
    // Any letter case is the same address.
    expect(await read(await signInAs("ANA@Example.com", "198.51.100.1"))).toEqual(TOO_MANY);
    // Even the right password waits from this client.
    expect(await read(await signInRight("ana@example.com", "198.51.100.1"))).toEqual(TOO_MANY);
    expect(service).toHaveBeenCalledTimes(10);

    expect((await signInAs("bea@example.com", "198.51.100.1")).status).toBe(401);

    app.advance(FIFTEEN_MINUTES);
    expect((await signInAs("ana@example.com", "198.51.100.1")).status).toBe(401);
  });

  it("does not lock the owner out: after 10 wrong passwords from a stranger, the right password from another client works", async () => {
    await app.auth.addUser("amy@example.com", "12345678", { confirmed: true });
    for (let i = 0; i < 10; i++) await signInAs("amy@example.com", "198.51.100.20");
    expect(await read(await signInAs("amy@example.com", "198.51.100.20"))).toEqual(TOO_MANY);

    expect((await signInRight("amy@example.com", "198.51.100.21")).status).toBe(200);
  });

  it("does not count successful sign-ins or an unconfirmed account with the right password", async () => {
    await app.auth.addUser("abe@example.com", "12345678", { confirmed: true });
    await app.auth.addUser("ada@example.com", "12345678", { confirmed: false });
    for (let i = 0; i < 12; i++) {
      expect((await signInRight("abe@example.com", "198.51.100.22")).status, `sign-in ${i + 1}`).toBe(200);
      expect((await signInRight("ada@example.com", "198.51.100.23")).status, `unconfirmed ${i + 1}`).toBe(403);
    }
  });

  it("refuses every client after 50 wrong passwords for one address from many clients", async () => {
    await app.auth.addUser("ari@example.com", "12345678", { confirmed: true });
    for (let c = 0; c < 5; c++) {
      for (let i = 0; i < 10; i++) expect((await signInAs("ari@example.com", `198.51.101.${c}`)).status).toBe(401);
    }
    expect(await read(await signInAs("ari@example.com", "198.51.101.99"))).toEqual(TOO_MANY);
    expect((await signInAs("art@example.com", "198.51.101.99")).status).toBe(401);
  });

  it("answers an unknown address exactly like a registered one", async () => {
    await app.auth.addUser("cid@example.com", "12345678", { confirmed: true });
    for (let i = 0; i < 10; i++) {
      await signInAs("cid@example.com", "198.51.100.3");
      await signInAs("nobody-1@example.com", "198.51.100.4");
    }
    expect(await read(await signInAs("cid@example.com", "198.51.100.3"))).toEqual(TOO_MANY);
    expect(await read(await signInAs("nobody-1@example.com", "198.51.100.4"))).toEqual(TOO_MANY);
  });

  it("does not count a request from another site or a malformed body (checked first)", async () => {
    const crossSite = { ...from("198.51.100.5"), origin: "https://evil.example", "sec-fetch-site": "cross-site" };
    for (let i = 0; i < 12; i++) {
      expect((await signIn(postJson("/api/auth/sign-in", { email: "dov@example.com", password: "x" }, crossSite), app.deps)).status).toBe(403);
      expect((await signIn(postJson("/api/auth/sign-in", { email: "dov@example.com" }, from("198.51.100.5")), app.deps)).status).toBe(400);
    }
    expect((await signInAs("dov@example.com", "198.51.100.5")).status).toBe(401);
  });
});

describe("request_password_reset, resend_confirmation, sign_up: at most 5 per address per 15 minutes", () => {
  it("refuses the 6th reset and sends no e-mail; the same for a registered and an unknown address", async () => {
    await app.auth.addUser("eli@example.com", "12345678", { confirmed: true });
    for (let i = 0; i < 5; i++) {
      expect((await reset("eli@example.com", "198.51.100.10")).status).toBe(200);
      expect((await reset("nobody-2@example.com", "198.51.100.11")).status).toBe(200);
    }
    const sent = app.auth.outbox.length;
    expect(await read(await reset("eli@example.com", "198.51.100.10"))).toEqual(TOO_MANY);
    expect(await read(await reset("nobody-2@example.com", "198.51.100.11"))).toEqual(TOO_MANY);
    expect(app.auth.outbox.length).toBe(sent);
    expect((await reset("fay@example.com", "198.51.100.10")).status).toBe(200);
    app.advance(FIFTEEN_MINUTES);
    expect((await reset("eli@example.com", "198.51.100.10")).status).toBe(200);
  });

  it("refuses the 6th resend of a confirmation link", async () => {
    await app.auth.addUser("gil@example.com", "12345678", { confirmed: false });
    for (let i = 0; i < 5; i++) {
      // The sign-in service itself allows one link a minute.
      app.advance(61_000);
      expect((await resend("gil@example.com", "198.51.100.12")).status).toBe(200);
    }
    app.advance(61_000);
    expect(await read(await resend("gil@example.com", "198.51.100.12"))).toEqual(TOO_MANY);
    expect((await resend("hal@example.com", "198.51.100.12")).status).toBe(200);
  });

  it("refuses the 6th sign-up for one address without asking the sign-in service", async () => {
    const service = vi.spyOn(app.auth, "signUp");
    for (let i = 0; i < 5; i++) expect((await register("ivy@example.com", "198.51.100.13")).status).not.toBe(429);
    expect(await read(await register("ivy@example.com", "198.51.100.13"))).toEqual(TOO_MANY);
    expect(service).toHaveBeenCalledTimes(5);
    expect((await register("jon@example.com", "198.51.100.13")).status).toBe(201);
  });
});

describe("per client: at most 30 of all four together per 15 minutes", () => {
  it("refuses the 31st attempt from one client, whatever the address; another client is not affected", async () => {
    const actions = [signInAs, reset, resend, register];
    for (let i = 0; i < 30; i++) {
      const answer = await actions[i % 4](`client-${i}@example.com`, "203.0.113.7");
      expect(answer.status, `attempt ${i + 1}`).not.toBe(429);
    }
    expect(await read(await reset("client-new@example.com", "203.0.113.7"))).toEqual(TOO_MANY);
    expect(await read(await signInAs("client-other@example.com", "203.0.113.7"))).toEqual(TOO_MANY);
    expect((await reset("client-new@example.com", "203.0.113.8")).status).toBe(200);
    app.advance(FIFTEEN_MINUTES);
    expect((await reset("client-new@example.com", "203.0.113.7")).status).toBe(200);
  });

  it("puts requests without X-Forwarded-For into one 'unknown' bucket", () => {
    expect(clientAddress(new Request("http://localhost/x", { headers: { "x-forwarded-for": " 203.0.113.9 , 10.0.0.1" } }))).toBe("203.0.113.9");
    expect(clientAddress(new Request("http://localhost/x"))).toBe("unknown");
    expect(clientAddress(new Request("http://localhost/x", { headers: { "x-forwarded-for": "" } }))).toBe("unknown");
  });
});
