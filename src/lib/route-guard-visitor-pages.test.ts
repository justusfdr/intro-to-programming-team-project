// Spec 45: the landing page and the legal notes are open to everyone. Nothing else opens with them:
// every other page still needs a sign-in (R3), also the ones right below or beside these two.
import { describe, expect, it } from "vitest";
import { guard, isPublic, VISITOR_PAGES } from "./route-guard";

const toSignIn = { kind: "redirect", to: "/sign-in" };

describe("guard and the pages for visitors", () => {
  it("names exactly the landing page and the legal notes", () => {
    expect([...VISITOR_PAGES]).toEqual(["/home", "/legal"]);
  });

  it.each(["/home", "/legal"])("lets a signed-out visitor see %s", (path) => {
    expect(guard(path, false)).toEqual({ kind: "allow" });
    expect(isPublic(path)).toBe(true);
  });

  it.each(["/home", "/legal"])("lets a signed-in user see %s as well", (path) => {
    expect(guard(path, true)).toEqual({ kind: "allow" });
  });

  it.each(["/home/", "/home/anything", "/homex", "/legal/terms", "/legalx", "/Home", "/LEGAL"])(
    "opens nothing below or beside them: %s still needs a sign-in",
    (path) => {
      expect(guard(path, false)).toEqual(toSignIn);
      expect(isPublic(path)).toBe(false);
    },
  );

  it("changes nothing for the app itself: its pages go to the sign-in page, its data answers 401", () => {
    for (const path of ["/", "/goals", "/coach", "/focus", "/analytics", "/settings", "/pricing", "/profile"]) {
      expect(guard(path, false), path).toEqual(toSignIn);
    }
    expect(guard("/api/home", false)).toEqual({ kind: "unauthorized" });
    expect(guard("/api/events", false)).toEqual({ kind: "unauthorized" });
  });
});
