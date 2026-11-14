// Sign-in and sign-up send a signed-in user to the calendar.
import { describe, expect, it } from "vitest";
import { signedInRedirect } from "./route-guard";

describe("signedInRedirect", () => {
  it("sends a signed-in user to the calendar and lets a visitor see the form", () => {
    expect(signedInRedirect("user-1")).toBe("/");
    expect(signedInRedirect(null)).toBeNull();
  });
});
