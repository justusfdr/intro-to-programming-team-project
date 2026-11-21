// Spec 63: the mark above every account form leads to the landing page.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountCard } from "./AccountCard";

describe("AccountCard", () => {
  const html = renderToStaticMarkup(
    <AccountCard title="Sign in" footer={<p>No account yet?</p>}>
      <form />
    </AccountCard>,
  );

  it("links the mark to the landing page, with a name for screen readers", () => {
    expect(html).toContain('href="/home"');
    expect(html).toContain('aria-label="LockedIn home page"');
  });

  it("has exactly one link of its own, so the form's links stay the page's own", () => {
    expect(html.match(/<a /g)).toHaveLength(1);
  });

  it("still shows the title, the content and the footer", () => {
    expect(html).toContain("<h1");
    expect(html).toContain("Sign in");
    expect(html).toContain("<form");
    expect(html).toContain("No account yet?");
  });
});
