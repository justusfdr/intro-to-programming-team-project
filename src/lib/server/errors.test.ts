import { describe, expect, it, vi } from "vitest";
import { AuthUnavailableError } from "./auth/types";
import { ActionError, handleAction } from "./errors";
import { requireUser } from "./session";
import { FakeAuth } from "./auth/fake";

async function answer(run: () => Promise<Response>) {
  const response = await handleAction(run);
  return { status: response.status, body: await response.json(), cache: response.headers.get("cache-control") };
}

describe("handleAction", () => {
  it("turns a rejection into its status and exact message", async () => {
    const result = await answer(async () => {
      throw new ActionError(409, "email_taken", "This email is already registered");
    });
    expect(result).toEqual({
      status: 409,
      body: { error: "email_taken", message: "This email is already registered" },
      cache: "no-store",
    });
  });

  it("answers 503 with the ontology's message when the database cannot be reached", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await answer(async () => {
      throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    });
    expect(result.status).toBe(503);
    expect(result.body.message).toBe("Your data cannot be loaded right now.");
  });

  it("hides the details of unexpected errors and of a broken sign-in service", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const unexpected = await answer(async () => {
      throw new Error("secret detail: postgres://user:password@host");
    });
    expect(unexpected).toMatchObject({ status: 500, body: { message: "Something went wrong. Nothing was changed." } });
    expect(JSON.stringify(unexpected.body)).not.toContain("secret");

    const authDown = await answer(async () => {
      throw new AuthUnavailableError("unexpected_failure (500)");
    });
    expect(authDown).toMatchObject({ status: 503, body: { error: "service_down" } });
  });
});

describe("requireUser (R3)", () => {
  it("answers 401 without a session and returns the user id with one", async () => {
    const auth = new FakeAuth();
    const signedOut = await answer(async () => {
      await requireUser(auth);
      return Response.json({ data: "secret" });
    });
    expect(signedOut).toMatchObject({ status: 401, body: { error: "unauthorized" } });

    const id = await auth.addUser("ana@example.com", "12345678", { confirmed: true });
    await auth.signIn({ email: "ana@example.com", password: "12345678" });
    expect(await requireUser(auth)).toBe(id);
  });
});
