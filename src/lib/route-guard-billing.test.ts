// Spec 24: Stripe's messages reach our server without a session; only that one address is open.
import { describe, expect, it } from "vitest";
import { guard } from "./route-guard";

describe("guard and Stripe's webhook", () => {
  it("lets Stripe reach /api/billing/webhook without a session", () => {
    expect(guard("/api/billing/webhook", false)).toEqual({ kind: "allow" });
  });

  it.each(["/api/billing/checkout", "/api/billing/cancel", "/api/billing/webhookx", "/api/billing/webhook/x", "/api/billing"])(
    "keeps %s closed to signed-out requests",
    (path) => {
      expect(guard(path, false)).toEqual({ kind: "unauthorized" });
    },
  );

  it("keeps the pricing page for signed-in users", () => {
    expect(guard("/pricing", false)).toEqual({ kind: "redirect", to: "/sign-in" });
    expect(guard("/pricing", true)).toEqual({ kind: "allow" });
  });
});
