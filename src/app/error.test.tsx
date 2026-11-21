// Issue #209: the error page offers a way back, not only "Try again".
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import PageError from "./error";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

describe("the error page", () => {
  const html = renderToStaticMarkup(<PageError error={new Error("x")} reset={() => {}} />);

  it("says the data cannot be loaded and offers 'Try again'", () => {
    expect(html).toContain("Your data cannot be loaded right now.");
    expect(html).toContain("Try again");
  });

  it("offers a link back to the start page", () => {
    expect(html).toMatch(/<a [^>]*href="\/"[^>]*>[^<]*Back to the calendar/);
  });
});
