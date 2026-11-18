// Spec 48: the library's articles as tiles of four sizes. A tile draws what its article has, with
// every value written out; it leads to the article with a link, or opens it with a button.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ARTICLES } from "@/lib/library/articles";
import { teasersFor, tileOf, tilesOf } from "@/lib/library/library";
import { FOCUS_PATTERN, LANDING_PATTERN, StudyBento, type TileSize } from "./Bento";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const count = (html: string, part: string) => html.split(part).length - 1;
const inHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");

/** The tiles of a rendered grid, one piece of markup each (a tile's own lists inside it stay whole). */
const tilesIn = (html: string) => html.split('<li class="relative flex rounded-card').slice(1);

const SLUGS = ["the-phone-on-your-desk", "where-the-23-minutes-come-from", "2-8-seconds", "a-small-speed-bump", "faster-and-more-stressed"];
const PATTERN: TileSize[] = ["hero", "tall", "square", "square", "wide"];

describe("the tiles as links", () => {
  const html = renderToStaticMarkup(<StudyBento tiles={tilesOf(SLUGS)} pattern={PATTERN} label="Articles" />);

  it("lead to each article once and name it for screen readers", () => {
    for (const tile of tilesOf(SLUGS)) {
      expect(count(html, `href="/focus/library/${tile.slug}"`), tile.slug).toBe(1);
      expect(html).toContain(`Read: ${inHtml(tile.title)}`);
      expect(html).toContain(tile.meta);
    }
    expect(html).not.toContain("<button");
    expect(html).toContain('aria-label="Articles"');
  });

  it("give the large tile two columns and two rows, the tall one two rows, the wide one two columns", () => {
    const items = tilesIn(html);
    expect(items).toHaveLength(5);
    expect(items[0]).toContain("@lg:col-span-2 @lg:row-span-2");
    expect(items[1]).toContain("@lg:row-span-2");
    expect(items[1]).not.toContain("@lg:col-span-2");
    expect(items[4]).toContain("@lg:col-span-2");
    expect(items[4]).not.toContain("row-span-2");
    for (const square of [items[2], items[3]]) expect(square).not.toMatch(/col-span|row-span/);
  });

  it("shows title and line on the large tile, and the shelf's drawing with its words", () => {
    const hero = tilesIn(html)[0];
    expect(hero).toContain(">The phone on your desk</h3>");
    expect(hero).toContain("One famous study says its mere presence drains your brain.");
    expect(hero).toContain("<svg");
  });

  it("numbers the steps on the tall tile and leaves the drawing's words out", () => {
    const tall = tilesIn(html)[1];
    expect(tall).toContain(">25:26<");
    expect(tall).toMatch(/>1<\/span>.*You work on the report.*>2<\/span>.*Something cuts in.*>4<\/span>.*Back on the report/s);
    expect(tall).not.toContain("Two other tasks");
  });

  it("writes every bar's value out on the wide tile, the longest bar filling the row", () => {
    const wide = tilesIn(html)[4];
    expect(wide).toContain("Time to finish the emails");
    for (const text of ["22.8 min", "20.3 min", "20.6 min"]) expect(wide).toContain(`>${text}<`);
    expect(wide).toContain("width:100%");
  });

  it("shows the number and what it counts on a square tile, and tints every second one", () => {
    const [first, second] = [tilesIn(html)[2], tilesIn(html)[3]];
    expect(first).toContain(">×2<");
    expect(first).toContain("errors after an interruption of 2.8 seconds");
    expect(first).not.toContain("bg-indigo-50");
    expect(second).toContain(">36%<");
    expect(second).toContain("bg-emerald-50");
  });
});

describe("the tiles as buttons", () => {
  it("open the article in a dialog and are no links", () => {
    const html = renderToStaticMarkup(<StudyBento tiles={tilesOf(SLUGS)} pattern={PATTERN} label="Articles" onOpen={() => {}} />);
    expect(count(html, '<button type="button" aria-haspopup="dialog"')).toBe(5);
    expect(html).not.toContain("href=");
    expect(html).toContain("Read: 2.8 seconds");
  });
});

describe("any article in any size", () => {
  it.each(["hero", "tall", "wide", "square"] as const)("draws as a %s tile with its title and reading time", (size) => {
    for (const article of ARTICLES) {
      const tile = tileOf(article);
      const html = renderToStaticMarkup(<StudyBento tiles={[tile]} pattern={[size]} label="Articles" />);
      expect(html, article.slug).toContain(inHtml(tile.title));
      expect(html, article.slug).toContain(tile.meta);
      if (tile.figure) expect(html, article.slug).toContain(`>${inHtml(tile.figure)}<`);
    }
  });

  it("shows a guide's title instead of a number on a square tile", () => {
    const html = renderToStaticMarkup(<StudyBento tiles={tilesOf(["set-up-a-session"])} pattern={["square"]} label="Articles" />);
    expect(html).toMatch(/<h3 class="mt-2\.5[^"]*">Set up a session in a minute<\/h3>/);
    expect(html.split("Set up a session in a minute").length - 1).toBe(2); // the title, and the link's name
    const number = renderToStaticMarkup(<StudyBento tiles={tilesOf(["2-8-seconds"])} pattern={["square"]} label="Articles" />);
    expect(number).toMatch(/<h3 class="sr-only">2\.8 seconds<\/h3>/);
  });

  it("draws a teaser too, which has no picture: number, title and reading time", () => {
    const teasers = teasersFor("2026-11-16");
    const html = renderToStaticMarkup(<StudyBento tiles={teasers} pattern={FOCUS_PATTERN} label="Articles" />);
    for (const teaser of teasers) {
      expect(html).toContain(`href="/focus/library/${teaser.slug}"`);
      expect(html).toContain(teaser.meta);
    }
  });

  it("makes tiles beyond the pattern square, and shows nothing for no tiles", () => {
    const html = renderToStaticMarkup(<StudyBento tiles={tilesOf(SLUGS)} pattern={["hero"]} label="Articles" />);
    expect(count(html, "row-span-2")).toBe(1);
    expect(renderToStaticMarkup(<StudyBento tiles={[]} pattern={FOCUS_PATTERN} label="Articles" />)).not.toContain("<li");
  });
});

describe("the two patterns", () => {
  it("fill whole rows of four columns: three rows on the Focus page, four on the landing page", () => {
    const cells = (pattern: readonly TileSize[]) => pattern.reduce((sum, size) => sum + { hero: 4, tall: 2, wide: 2, square: 1 }[size], 0);
    expect(FOCUS_PATTERN).toHaveLength(7);
    expect(cells(FOCUS_PATTERN)).toBe(12);
    expect(LANDING_PATTERN).toHaveLength(9);
    expect(cells(LANDING_PATTERN)).toBe(16);
  });
});
