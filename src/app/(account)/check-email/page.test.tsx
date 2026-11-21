// Issue #200: sign-up answers the same for a new and a taken address (spec 50), so the owner of a taken
// address gets no mail. The page says, the same for everyone, what to do then: sign in or reset the password.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExistingAccountHint } from "@/components/account/ExistingAccountHint";
import CheckEmailPage from "./page";

describe("issue #200: a way out when no mail comes", () => {
  it("the hint names both ways and links them", () => {
    const html = renderToStaticMarkup(<ExistingAccountHint />);
    expect(html).toContain("Already have an account?");
    expect(html).toMatch(/href="\/sign-in"[^>]*>Sign in</);
    expect(html).toMatch(/href="\/forgot-password"[^>]*>reset your password</);
  });

  it("the check-email page shows the hint and still offers a new link", () => {
    const html = renderToStaticMarkup(<CheckEmailPage />);
    expect(html).toContain("Already have an account?");
    expect(html).toContain('href="/forgot-password"');
    expect(html).toContain("Send a new link");
  });
});
