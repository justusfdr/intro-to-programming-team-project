// Reading the library (spec 29): which articles stand on which shelf, how long one takes to read,
// which studies it rests on, and which three the Focus page shows today. All calculated from the
// fixed content in ./articles.ts and ./studies.ts; nothing is saved.
import { ARTICLES } from "./articles";
import { STUDIES } from "./studies";
import type { Article, Block, Study, Teaser, Tile, TilePicture, Topic } from "./types";

/** The shelves, in the order of the filter. */
export const TOPICS: { id: Topic; label: string }[] = [
  { id: "interruptions", label: "Interruptions" },
  { id: "phones", label: "Phones and feeds" },
  { id: "helps", label: "What helps" },
  { id: "guides", label: "Guides" },
];

export function topicLabel(topic: Topic): string {
  return TOPICS.find((t) => t.id === topic)!.label;
}

/** The shelf an address names (`?topic=phones`), or none for anything else. */
export function topicOf(value: string | undefined): Topic | null {
  return TOPICS.find((t) => t.id === value)?.id ?? null;
}

/** All articles, or those of one shelf, in the library's order. */
export function articlesOn(topic: Topic | null): Article[] {
  return topic ? ARTICLES.filter((article) => article.topic === topic) : ARTICLES;
}

export function articleBySlug(slug: string): Article | null {
  return ARTICLES.find((article) => article.slug === slug) ?? null;
}

/** The studies of an article, in the order the article names them. */
export function studiesOf(article: Article): Study[] {
  return article.studies.map((id) => STUDIES.find((study) => study.id === id)!);
}

/** Every word a reader reads in a block. */
function wordsOf(block: Block): string {
  switch (block.kind) {
    case "p":
    case "h":
    case "limits":
    case "try":
      return block.text;
    case "stats":
      return block.stats.map((stat) => `${stat.value} ${stat.label}`).join(" ");
    case "bars":
      return [block.title, block.note ?? "", ...block.bars.map((bar) => `${bar.label} ${bar.text}`)].join(" ");
    case "steps":
      return [block.title, ...block.steps.map((step) => `${step.label} ${step.detail}`)].join(" ");
  }
}

/** Words an adult reads in a minute, at an easy pace. */
const WORDS_PER_MINUTE = 200;

/** Minutes to read an article: its words at an easy pace, rounded up, at least one. */
export function readMinutes(article: Article): number {
  const text = [article.title, article.dek, ...article.body.map(wordsOf)].join(" ");
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

/** "4 min read · 2 studies" under a title. A guide has no studies and says "Guide". */
export function metaLine(article: Article): string {
  const count = article.studies.length;
  const basis = count === 0 ? "Guide" : count === 1 ? "1 study" : `${count} studies`;
  return `${readMinutes(article)} min read · ${basis}`;
}

/** Up to `count` other articles to read next: first the same shelf, then the rest, in order. */
export function readNext(article: Article, count = 2): Article[] {
  const others = ARTICLES.filter((other) => other.slug !== article.slug);
  return [...others.filter((o) => o.topic === article.topic), ...others.filter((o) => o.topic !== article.topic)].slice(0, count);
}

/**
 * The three articles the Focus page shows on a day ("2026-11-16"): they move on by one each day,
 * so the page looks different tomorrow and the same all day.
 */
export function teasersFor(localDate: string): Teaser[] {
  const day = Math.floor(Date.parse(`${localDate}T00:00:00Z`) / 86_400_000);
  const start = ((Number.isFinite(day) ? day : 0) % ARTICLES.length + ARTICLES.length) % ARTICLES.length;
  return [0, 1, 2].map((step) => {
    const article = ARTICLES[(start + step) % ARTICLES.length];
    return { slug: article.slug, topic: article.topic, title: article.title, figure: article.figure?.value ?? null, meta: metaLine(article) };
  });
}

/** The first picture in an article's text, as a tile can draw it: at most four bars or steps. */
function pictureOf(article: Article): TilePicture | null {
  for (const block of article.body) {
    if (block.kind === "bars") return { kind: "bars", title: block.title, bars: block.bars.slice(0, 4) };
    if (block.kind === "steps") return { kind: "steps", steps: block.steps.slice(0, 4).map((step) => step.label) };
    if (block.kind === "stats") return { kind: "stats", stats: block.stats.slice(0, 3) };
  }
  return null;
}

/** An article as a tile (spec 47): what the teaser has, plus its line, its number's label and one picture. */
export function tileOf(article: Article): Tile {
  return {
    slug: article.slug,
    topic: article.topic,
    title: article.title,
    figure: article.figure?.value ?? null,
    meta: metaLine(article),
    dek: article.dek,
    label: article.figure?.label ?? null,
    picture: pictureOf(article),
  };
}

/** The tiles of the articles with these addresses, in the order given. An unknown address is left out. */
export function tilesOf(slugs: readonly string[]): Tile[] {
  return slugs.flatMap((slug) => {
    const article = articleBySlug(slug);
    return article ? [tileOf(article)] : [];
  });
}

/**
 * The tiles the Focus page shows on a day (spec 47): `count` articles in a row, starting with the
 * three of `teasersFor`, so they move on by one each day as well.
 */
export function tilesFor(localDate: string, count = 7): Tile[] {
  const first = teasersFor(localDate)[0].slug;
  const start = ARTICLES.findIndex((article) => article.slug === first);
  const size = Math.min(Math.max(0, count), ARTICLES.length);
  return Array.from({ length: size }, (_, step) => tileOf(ARTICLES[(start + step) % ARTICLES.length]));
}
