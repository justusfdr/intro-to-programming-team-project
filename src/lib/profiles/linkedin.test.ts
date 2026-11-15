// The LinkedIn link (spec 40): the stored form is the very pattern the database checks, and typed input
// is turned into it or refused. Both tables of examples are used by the database tests too.
import { describe, expect, it } from "vitest";
import { STORED_EXAMPLES, TYPED_EXAMPLES } from "@test/support/linkedin-examples";
import { cleanLinkedIn, isLinkedInUrl, LINKEDIN_URL } from "./linkedin";

describe("LinkedIn link", () => {
  it("is the same pattern as app.linkedin_url_valid", () => {
    expect(LINKEDIN_URL.source).toBe("^https:\\/\\/www\\.linkedin\\.com\\/in\\/[A-Za-z0-9_%-]{3,100}$");
    expect(LINKEDIN_URL.flags).toBe("");
  });

  for (const example of STORED_EXAMPLES) {
    it(`stored form: ${example.what} is ${example.ok ? "accepted" : "refused"}`, () => {
      expect(isLinkedInUrl(example.url)).toBe(example.ok);
    });
  }

  for (const example of TYPED_EXAMPLES) {
    it(`typed: ${example.what}`, () => {
      const result = cleanLinkedIn(example.typed);
      if (example.saved === "refused") expect(result).toEqual({ ok: false });
      else expect(result).toEqual({ ok: true, url: example.saved });
      // Whatever is saved passes the stored form.
      if (result.ok && result.url !== null) expect(isLinkedInUrl(result.url)).toBe(true);
    });
  }

  it("refuses anything that is not text at render time", () => {
    for (const value of [null, undefined, 42, { toString: () => "https://www.linkedin.com/in/lea" }]) expect(isLinkedInUrl(value)).toBe(false);
  });
});
