// The rules on texts other people see, on the TypeScript side (security review of sharing, fix 3): no
// characters that render blank or are invisible inside a word, at most two combining marks in a row,
// and a letter or digit in a display name. The same table runs against the database in
// test/db/sharing-hardening-schema.test.ts.
import { describe, expect, it } from "vitest";
import { TEXT_EXAMPLES } from "@test/support/text-examples";
import { cleanEntryTitle, cleanListTitle } from "@/lib/lists/text";
import { cleanDisplayName } from "./display-name";

describe("cleanDisplayName with the shared examples", () => {
  for (const example of TEXT_EXAMPLES) {
    it(`${example.name ? "accepts" : "refuses"} ${example.what}`, () => {
      expect(cleanDisplayName(example.text)).toBe(example.name ? example.text : null);
    });
  }
});

describe("cleanListTitle and cleanEntryTitle with the shared examples", () => {
  for (const example of TEXT_EXAMPLES) {
    it(`${example.title ? "accepts" : "refuses"} ${example.what}`, () => {
      expect(cleanListTitle(example.text)).toBe(example.title ? example.text : null);
      expect(cleanEntryTitle(example.text)).toBe(example.title ? example.text : null);
    });
  }
});
