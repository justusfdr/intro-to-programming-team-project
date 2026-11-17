// The Focus library (spec 29): short articles on attention and the studies they rest on.
// Fixed content, the same for every user. Nothing here is saved or read from the database.

/** The shelves of the library. An article stands on exactly one. */
export type Topic = "interruptions" | "phones" | "helps" | "guides";

/** How a study got its result. Shown as a small label on the study's card. */
export type StudyKind = "Field study" | "Lab experiment" | "Randomized experiment" | "Meta-analysis";

export type Study = {
  id: string;
  /** As shown on the card: family names, "et al." from the fourth author on. */
  authors: string;
  year: number;
  title: string;
  /** The journal or conference. */
  venue: string;
  kind: StudyKind;
  /** Reviewed by other researchers before it was printed. False for a chapter in an edited series. */
  peerReviewed: boolean;
  /** The publication's own page: a DOI link where we have one. */
  url: string;
};

/** A number worth a tile of its own. */
export type Stat = { value: string; label: string };

/** One bar of a small chart. `text` is the value as the reader sees it. */
export type Bar = { label: string; value: number; text: string; strong?: boolean };

export type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string }
  | { kind: "stats"; stats: Stat[] }
  /** A few bars to compare. `note` says what the numbers are. */
  | { kind: "bars"; title: string; bars: Bar[]; note?: string }
  /** Things that happen one after the other. */
  | { kind: "steps"; title: string; steps: { label: string; detail: string }[] }
  /** What the study cannot show. Every article with a study has one. */
  | { kind: "limits"; text: string }
  /** What to do with it, in this app. */
  | { kind: "try"; text: string };

export type Article = {
  slug: string;
  topic: Topic;
  title: string;
  /** One or two sentences under the title, also on the tile. */
  dek: string;
  /** The number on the tile and what it counts. Guides have none. */
  figure?: Stat;
  body: Block[];
  /** Ids of the studies the article rests on, in the order they appear. */
  studies: string[];
};

/** What the Focus page needs of an article: enough for a row, not the text. */
export type Teaser = { slug: string; topic: Topic; title: string; figure: string | null; meta: string };

/** The one picture a tile can draw, taken from the article's own text. */
export type TilePicture =
  | { kind: "bars"; title: string; bars: Bar[] }
  | { kind: "steps"; steps: string[] }
  | { kind: "stats"; stats: Stat[] };

/**
 * What a tile needs of an article (spec 47): the teaser, the line under the title, what the
 * tile's number counts, and the first picture of the article. Still not the text.
 */
export type Tile = Teaser & { dek: string; label: string | null; picture: TilePicture | null };

/** One step of "Before you start" on the Focus page (spec 47). */
export type StartStep = {
  id: "phone" | "first-step" | "banners";
  title: string;
  /** One sentence from the study, with numbers the article has. */
  text: string;
  /** The study the sentence rests on, and the article that tells it in full. */
  study: string;
  slug: string;
  /** This step has a field to type into. */
  field?: { label: string; placeholder: string };
};

/** A popular claim and what the studies leave of it (spec 47), for the landing page. */
export type Claim = { quote: string; verdict: "Half true" | "Not confirmed" | "Not shown"; slug: string };
