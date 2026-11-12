import { describe, expect, it } from "vitest";
import { guard } from "./route-guard";

describe("guard (R3: not signed in gets the sign-in page or 401, no data)", () => {
  it.each(["/", "/calendar", "/settings"])("sends a signed-out visitor of %s to the sign-in page", (path) => {
    expect(guard(path, false)).toEqual({ kind: "redirect", to: "/sign-in" });
  });

  it.each(["/api/events", "/api", "/api/settings/x"])("answers 401 to a signed-out data request to %s", (path) => {
    expect(guard(path, false)).toEqual({ kind: "unauthorized" });
  });

  it.each(["/sign-up", "/sign-in", "/auth/confirm", "/reset-password", "/api/auth/sign-up"])(
    "lets everyone reach the account address %s",
    (path) => {
      expect(guard(path, false)).toEqual({ kind: "allow" });
    },
  );

  it("does not treat look-alike addresses as account pages", () => {
    expect(guard("/sign-upx", false)).toEqual({ kind: "redirect", to: "/sign-in" });
    expect(guard("/api/authx", false)).toEqual({ kind: "unauthorized" });
  });

  it("lets a signed-in user through everywhere", () => {
    expect(guard("/", true)).toEqual({ kind: "allow" });
    expect(guard("/api/events", true)).toEqual({ kind: "allow" });
  });
});

describe("guard and the framework's own addresses", () => {
  it("lets /_next/ and /__nextjs addresses through only in development", () => {
    expect(guard("/_next/webpack-hmr", false, { development: true })).toEqual({ kind: "allow" });
    expect(guard("/__nextjs_original-stack-frames", false, { development: true })).toEqual({ kind: "allow" });
    expect(guard("/_next/webpack-hmr", false)).toEqual({ kind: "redirect", to: "/sign-in" });
    expect(guard("/_next/webpack-hmr", false, { development: false })).toEqual({ kind: "redirect", to: "/sign-in" });
    expect(guard("/_nextish", false, { development: true })).toEqual({ kind: "redirect", to: "/sign-in" });
    expect(guard("/api/tasks", false, { development: true })).toEqual({ kind: "unauthorized" });
  });
});
