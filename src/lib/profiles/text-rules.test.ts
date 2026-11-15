// The rules on the profile's texts, on the TypeScript side (spec 40): no characters that render blank
// or are invisible inside a word, at most two combining marks in a row, and a letter or digit in a
// display name. The same table (test/support/text-examples.ts) runs against the database in
// test/db/sharing-hardening-kept-schema.test.ts and test/db/profile-page-schema.test.ts.
import { describe, expect, it } from "vitest";
import { TEXT_EXAMPLES } from "@test/support/text-examples";
import { cleanShownText } from "@/lib/text/shown-text";
import { cleanDisplayName } from "./display-name";

describe("cleanDisplayName with the table of examples", () => {
  for (const example of TEXT_EXAMPLES) {
    it(`${example.name ? "accepts" : "refuses"} ${example.what}`, () => {
      expect(cleanDisplayName(example.text)).toBe(example.name ? example.text : null);
    });
  }
});

// The rule (cleanShownText) guards the bio; it runs here with two other maximums (60 and 200), so the
// examples do not depend on the bio's 160.
describe("cleanShownText with the table of examples", () => {
  for (const example of TEXT_EXAMPLES) {
    it(`${example.title ? "accepts" : "refuses"} ${example.what}`, () => {
      expect(cleanShownText(example.text, 60)).toBe(example.title ? example.text : null);
      expect(cleanShownText(example.text, 200)).toBe(example.title ? example.text : null);
    });
  }
});
