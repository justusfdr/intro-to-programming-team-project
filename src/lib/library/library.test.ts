// The Focus library's content and what is calculated from it (spec 29): the articles and their
// studies fit together, reading time comes from the words, the shelves filter, and the Focus page
// gets three articles that move on by one each day.
import { describe, expect, it } from "vitest";
import { ARTICLES } from "./articles";
import { articleHref, shelfHref } from "./href";
import { articleBySlug, articlesOn, metaLine, readMinutes, readNext, studiesOf, teasersFor, TOPICS, topicLabel, topicOf } from "./library";
import { STUDIES } from "./studies";
import type { Article } from "./types";

const withStudies = ARTICLES.filter((article) => article.studies.length > 0);
const guides = ARTICLES.filter((article) => article.studies.length === 0);

function article(fields: Partial<Article>): Article {
  return { slug: "x", topic: "helps", title: "Title", dek: "Dek", body: [], studies: [], ...fields };
}

describe("the library's studies", () => {
  it("are at most fifteen, each with its own id and a link to the publication", () => {
    expect(STUDIES.length).toBeGreaterThanOrEqual(5);
    expect(STUDIES.length).toBeLessThanOrEqual(15);
    expect(new Set(STUDIES.map((study) => study.id)).size).toBe(STUDIES.length);
    for (const study of STUDIES) {
      expect(study.url, study.id).toMatch(/^https:\/\/(doi\.org\/10\.|pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/$)/);
      expect(study.year, study.id).toBeGreaterThanOrEqual(2000);
      expect(study.title.length, study.id).toBeGreaterThan(10);
    }
  });

  it("are each used by an article, and an article names only studies that exist", () => {
    const used = new Set(ARTICLES.flatMap((a) => a.studies));
    expect(STUDIES.map((study) => study.id).filter((id) => !used.has(id))).toEqual([]);
    const known = new Set(STUDIES.map((study) => study.id));
    expect([...used].filter((id) => !known.has(id))).toEqual([]);
  });

  it("come back for an article in the order the article names them", () => {
    const phone = articleBySlug("the-phone-on-your-desk")!;
    expect(studiesOf(phone).map((study) => study.id)).toEqual(["ward-2017", "hartanto-2024", "stothart-2015"]);
    expect(studiesOf(guides[0])).toEqual([]);
  });
});

describe("the library's articles", () => {
  it("have addresses of their own, made of lower-case words", () => {
    expect(new Set(ARTICLES.map((a) => a.slug)).size).toBe(ARTICLES.length);
    for (const a of ARTICLES) expect(a.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(articleHref("2-8-seconds")).toBe("/focus/library/2-8-seconds");
  });

  it("are found by their address, and an unknown address finds nothing", () => {
    expect(articleBySlug("2-8-seconds")?.title).toBe("2.8 seconds");
    expect(articleBySlug("no-such-article")).toBeNull();
    expect(articleBySlug("")).toBeNull();
  });

  it("with a study carry a number for the tile, say what the study cannot show, and end in something to try", () => {
    expect(withStudies.length).toBeGreaterThanOrEqual(5);
    for (const a of withStudies) {
      expect(a.figure, a.slug).toBeDefined();
      expect(a.body.filter((block) => block.kind === "limits"), a.slug).toHaveLength(1);
      expect(a.body.at(-1)?.kind, a.slug).toBe("try");
    }
  });

  it("stand on a shelf that exists, and every shelf has articles", () => {
    for (const shelf of TOPICS) expect(articlesOn(shelf.id).length, shelf.id).toBeGreaterThan(0);
    expect(articlesOn(null)).toEqual(ARTICLES);
    expect(articlesOn("guides")).toEqual(guides);
    expect(topicLabel("phones")).toBe("Phones and feeds");
  });

  it("have pictures the page can draw: two or three numbers, two to four steps, bars above zero", () => {
    for (const a of ARTICLES) {
      for (const block of a.body) {
        if (block.kind === "stats") expect([2, 3], a.slug).toContain(block.stats.length);
        if (block.kind === "steps") expect([2, 3, 4], a.slug).toContain(block.steps.length);
        if (block.kind === "bars") {
          expect(block.bars.length, a.slug).toBeGreaterThanOrEqual(2);
          for (const bar of block.bars) expect(bar.value, `${a.slug}: ${bar.label}`).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("a shelf in the address", () => {
  it("is taken when it names a shelf", () => {
    expect(topicOf("phones")).toBe("phones");
    expect(shelfHref("phones")).toBe("/focus/library?topic=phones");
    expect(shelfHref(null)).toBe("/focus/library");
  });

  it("is ignored when it names none: the library shows everything", () => {
    expect(topicOf("games")).toBeNull();
    expect(topicOf("")).toBeNull();
    expect(topicOf(undefined)).toBeNull();
  });
});

describe("reading time", () => {
  it("is the article's words at 200 a minute, rounded up", () => {
    const words = (count: number) => Array.from({ length: count }, () => "word").join(" ");
    // Title and dek are two words; 198 more make 200.
    expect(readMinutes(article({ body: [{ kind: "p", text: words(198) }] }))).toBe(1);
    expect(readMinutes(article({ body: [{ kind: "p", text: words(199) }] }))).toBe(2);
    expect(readMinutes(article({ body: [{ kind: "p", text: words(598) }] }))).toBe(3);
  });

  it("is never under a minute, and counts the words in pictures too", () => {
    expect(readMinutes(article({}))).toBe(1);
    const bars = { kind: "bars" as const, title: "T", bars: Array.from({ length: 100 }, (_, i) => ({ label: `bar ${i}`, value: 1, text: "1" })) };
    expect(readMinutes(article({ body: [bars] }))).toBe(2);
  });

  it("stays short for every article: one to six minutes", () => {
    for (const a of ARTICLES) {
      expect(readMinutes(a), a.slug).toBeGreaterThanOrEqual(1);
      expect(readMinutes(a), a.slug).toBeLessThanOrEqual(6);
    }
  });

  it("stands under the title with the number of studies, or Guide", () => {
    expect(metaLine(article({ studies: ["a", "b"] }))).toBe("1 min read · 2 studies");
    expect(metaLine(article({ studies: ["a"] }))).toBe("1 min read · 1 study");
    expect(metaLine(article({}))).toBe("1 min read · Guide");
  });
});

describe("what to read next", () => {
  it("is two other articles, the same shelf first", () => {
    const first = ARTICLES[0];
    const next = readNext(first);
    expect(next).toHaveLength(2);
    expect(next.map((a) => a.slug)).not.toContain(first.slug);
    expect(next.every((a) => a.topic === first.topic)).toBe(true);
  });

  it("goes on to other shelves when the shelf has no more", () => {
    const lonely = articleBySlug("decide-before-the-moment")!;
    const next = readNext(lonely);
    expect(next[0].slug).toBe("a-small-speed-bump");
    expect(next[1].topic).not.toBe(lonely.topic);
  });
});

describe("the three articles on the Focus page", () => {
  it("are three different ones, the same all day", () => {
    const today = teasersFor("2026-11-16");
    expect(today).toHaveLength(3);
    expect(new Set(today.map((t) => t.slug)).size).toBe(3);
    expect(teasersFor("2026-11-16")).toEqual(today);
  });

  it("move on by one article the next day, around the whole library", () => {
    const today = teasersFor("2026-11-16");
    const tomorrow = teasersFor("2026-11-17");
    expect(tomorrow.slice(0, 2)).toEqual(today.slice(1));
    const seen = new Set<string>();
    for (let day = 1; day <= ARTICLES.length; day++) seen.add(teasersFor(`2026-12-${String(day).padStart(2, "0")}`)[0].slug);
    expect(seen.size).toBe(ARTICLES.length);
  });

  it("carry the tile's number and the line under the title, not the text", () => {
    const all = Array.from({ length: ARTICLES.length }, (_, i) => teasersFor(`2026-12-${String(i + 1).padStart(2, "0")}`)[0]);
    const bump = all.find((t) => t.slug === "a-small-speed-bump")!;
    expect(bump).toEqual({ slug: "a-small-speed-bump", topic: "helps", title: "A small speed bump", figure: "36 %", meta: metaLine(articleBySlug("a-small-speed-bump")!) });
    expect(all.find((t) => t.slug === "set-up-a-session")!.figure).toBeNull();
  });

  it("still give three articles for a date that is none", () => {
    expect(teasersFor("not a date").map((t) => t.slug)).toEqual(ARTICLES.slice(0, 3).map((a) => a.slug));
  });
});
