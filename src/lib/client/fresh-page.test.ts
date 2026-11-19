// After the session changed, the next page is loaded in full (src/lib/client/fresh-page.ts). Reported by
// the owner on 19 Nov 2026: right after signing in, the framework's error page showed until Reload.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openFresh, ownPathOrStart } from "./fresh-page";

afterEach(() => vi.unstubAllGlobals());

describe("openFresh", () => {
  it("loads the page in full, as Reload does", () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    openFresh("/sign-in");
    expect(assign).toHaveBeenCalledExactlyOnceWith("/sign-in");
  });

  it("never leaves this site: anything that is not one of its own paths opens the start page", () => {
    expect(ownPathOrStart("/")).toBe("/");
    expect(ownPathOrStart("/sign-in")).toBe("/sign-in");
    expect(ownPathOrStart("//evil.example")).toBe("/");
    expect(ownPathOrStart("/\\evil.example")).toBe("/");
    expect(ownPathOrStart("https://evil.example")).toBe("/");
    expect(ownPathOrStart("javascript:alert(1)")).toBe("/");
    expect(ownPathOrStart("")).toBe("/");
  });
});

describe("every place where the session changes", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
  const PLACES = [
    "src/app/(account)/sign-in/SignInForm.tsx", // sign_in
    "src/components/account/SignOutButton.tsx", // sign_out (profile page)
    "src/components/settings/YourAccountCard.tsx", // sign_out and delete_account (settings)
  ];

  it.each(PLACES)("%s opens the next page in full and not through the client-side router", (path) => {
    const source = read(path);
    expect(source).toContain("openFresh(");
    expect(source).not.toMatch(/router\.(push|replace)\(/);
  });

  it("no other component moves on with the client-side router right after an account action", () => {
    // The account actions answer under /api/auth and /api/account/delete.
    for (const path of PLACES) expect(read(path)).toMatch(/\/api\/(auth|account)\//);
    const signIn = read(PLACES[0]);
    expect(signIn).not.toContain("useRouter");
  });
});
