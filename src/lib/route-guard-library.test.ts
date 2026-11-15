// The Focus library (spec 29) is part of the app: its pages need a signed-in user like every other
// page (R3), although they show nothing of the user's own.
import { describe, expect, it } from "vitest";
import { guard } from "./route-guard";

describe("the library's pages", () => {
  it("open for a signed-in user", () => {
    expect(guard("/focus/library", true)).toEqual({ kind: "allow" });
    expect(guard("/focus/library/2-8-seconds", true)).toEqual({ kind: "allow" });
  });

  it("send a visitor without a session to the sign-in page", () => {
    expect(guard("/focus/library", false)).toEqual({ kind: "redirect", to: "/sign-in" });
    expect(guard("/focus/library/2-8-seconds", false)).toEqual({ kind: "redirect", to: "/sign-in" });
  });
});
