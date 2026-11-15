// One table of examples for the rules on texts other people see (security review of sharing, fix 3):
// a display name (app.display_name_valid, src/lib/profiles/display-name.ts) and a list or entry title
// (app.list_text_valid, src/lib/lists/text.ts). The database tests and the TypeScript tests both run
// every row, so the two sides of each rule cannot drift apart. No example has spaces at either end, so
// the TypeScript trimming leaves it as it is.

export type TextExample = {
  /** What the example shows. */
  what: string;
  text: string;
  /** Accepted as a display name. */
  name: boolean;
  /** Accepted as a list or entry title. */
  title: boolean;
};

export const TEXT_EXAMPLES: readonly TextExample[] = [
  // Accepted before and still accepted.
  { what: "a plain name", text: "Lea Martins", name: true, title: true },
  { what: "accents written as one character", text: "José Ñúñez", name: true, title: true },
  { what: "one combining accent", text: "José", name: true, title: true },
  { what: "two combining marks in a row", text: "á̂", name: true, title: true },
  { what: "three marks, but not in a row", text: "áb̂c̃", name: true, title: true },
  { what: "Cyrillic", text: "Лея", name: true, title: true },
  { what: "Japanese", text: "日本語", name: true, title: true },
  { what: "Devanagari with vowel signs", text: "नमस्ते", name: true, title: true },
  { what: "Arabic-Indic digits", text: "١٢٣", name: true, title: true },
  { what: "a roman numeral", text: "Ⅳ", name: true, title: true },
  { what: "letters and digits", text: "R2-D2", name: true, title: true },
  { what: "an emoji next to a name", text: "😀 Lea", name: true, title: true },
  { what: "a Korean name (Hangul syllables, not the filler)", text: "한국", name: true, title: true },
  // A title needs no letter; a name does.
  { what: "only an emoji", text: "🛒", name: false, title: true },
  { what: "an emoji with a skin tone", text: "👍🏽", name: false, title: true },
  { what: "only punctuation", text: "---", name: false, title: true },
  { what: "a circled digit (not a decimal digit)", text: "①", name: false, title: true },
  // Characters that render blank.
  { what: "Hangul filler U+3164 alone", text: "ㅤ", name: false, title: false },
  { what: "Hangul filler U+3164 after a name", text: "Leaㅤ", name: false, title: false },
  { what: "Hangul choseong filler U+115F", text: "ᅟLea", name: false, title: false },
  { what: "Hangul jungseong filler U+1160", text: "Leᅠa", name: false, title: false },
  { what: "halfwidth Hangul filler U+FFA0", text: "Leaﾠ", name: false, title: false },
  { what: "Braille blank U+2800", text: "⠀", name: false, title: false },
  { what: "Mongolian vowel separator U+180E", text: "Le᠎a", name: false, title: false },
  // Characters invisible inside a word.
  { what: "soft hyphen U+00AD", text: "Lea­Martins", name: false, title: false },
  { what: "combining grapheme joiner U+034F", text: "Le͏a", name: false, title: false },
  { what: "Arabic letter mark U+061C", text: "Le؜a", name: false, title: false },
  { what: "Khmer inherent vowel U+17B4", text: "Le឴a", name: false, title: false },
  { what: "Khmer inherent vowel U+17B5", text: "Le឵a", name: false, title: false },
  { what: "variation selector U+FE00", text: "Le︀a", name: false, title: false },
  { what: "variation selector U+FE0F", text: "Lea️", name: false, title: false },
  { what: "tag U+E0001", text: "Lea\u{e0001}", name: false, title: false },
  { what: "tag U+E0041", text: "Le\u{e0041}a", name: false, title: false },
  { what: "cancel tag U+E007F", text: "Lea\u{e007f}", name: false, title: false },
  { what: "variation selector U+E0100", text: "Lea\u{e0100}", name: false, title: false },
  { what: "variation selector U+E01EF", text: "Lea\u{e01ef}", name: false, title: false },
  // Stacks of combining marks.
  { what: "three combining marks in a row", text: "á̂̃", name: false, title: false },
  { what: "three marks from three blocks", text: "a᪰᷀⃐", name: false, title: false },
  { what: "three combining half marks", text: "a︠︡︢", name: false, title: false },
  { what: "a long stack", text: "Lea" + "̶".repeat(12), name: false, title: false },
];
