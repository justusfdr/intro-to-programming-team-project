// Spec 48: the library's articles as tiles, the three steps of "Before you start", the three
// claims of the landing page, and the first step that stays in the browser.
import { describe, expect, it } from "vitest";
import { cleanFirstStep, clearFirstStep, FIRST_STEP_MAX, readFirstStep, saveFirstStep } from "@/lib/client/first-step";
import { ARTICLES } from "./articles";
import { CLAIMS, START_STEPS } from "./before-you-start";
import { articleBySlug, metaLine, teasersFor, tileOf, tilesFor, tilesOf } from "./library";
import { STUDIES } from "./studies";

/** Every number written in a sentence: "2.8", "94", "4.3". */
const numbersIn = (text: string) => text.match(/\d+(?:\.\d+)?/g) ?? [];

describe("an article as a tile", () => {
  it("carries the teaser, the line under the title and what its number counts", () => {
    const bump = articleBySlug("a-small-speed-bump")!;
    expect(tileOf(bump)).toMatchObject({
      slug: "a-small-speed-bump",
      topic: "helps",
      title: "A small speed bump",
      figure: "36%",
      meta: metaLine(bump),
      dek: bump.dek,
      label: "of attempts to open an app were dropped after a short pause",
    });
  });

  it("draws the first picture of the article: bars, steps or numbers, with the article's own values", () => {
    expect(tileOf(articleBySlug("where-the-23-minutes-come-from")!).picture).toEqual({
      kind: "steps",
      steps: ["You work on the report", "Something cuts in", "Two other things", "Back on the report"],
    });
    const stress = tileOf(articleBySlug("faster-and-more-stressed")!).picture;
    expect(stress?.kind).toBe("bars");
    if (stress?.kind === "bars") expect(stress.bars.map((bar) => bar.text)).toEqual(["22.8 min", "20.3 min", "20.6 min"]);
    const phone = tileOf(articleBySlug("the-phone-on-your-desk")!).picture;
    expect(phone).toEqual({
      kind: "stats",
      stats: [
        { value: "520", label: "students in the first 2017 experiment" },
        { value: "33", label: "studies pooled in 2024" },
        { value: "−0.02", label: "overall effect, no different from zero" },
      ],
    });
  });

  it("has a picture for every article and guide, never more than four bars or steps or three numbers", () => {
    for (const article of ARTICLES) {
      const picture = tileOf(article).picture;
      expect(picture, article.slug).not.toBeNull();
      if (picture?.kind === "bars") expect(picture.bars.length, article.slug).toBeLessThanOrEqual(4);
      if (picture?.kind === "steps") expect(picture.steps.length, article.slug).toBeLessThanOrEqual(4);
      if (picture?.kind === "stats") expect(picture.stats.length, article.slug).toBeLessThanOrEqual(3);
    }
  });

  it("has no number and no label for a guide", () => {
    const guide = tileOf(articleBySlug("set-up-a-session")!);
    expect(guide.figure).toBeNull();
    expect(guide.label).toBeNull();
  });
});

describe("the tiles on the Focus page", () => {
  it("are seven different articles, starting with the day's three", () => {
    const tiles = tilesFor("2026-11-16");
    expect(tiles).toHaveLength(7);
    expect(new Set(tiles.map((tile) => tile.slug)).size).toBe(7);
    expect(tiles.slice(0, 3).map((tile) => tile.slug)).toEqual(teasersFor("2026-11-16").map((teaser) => teaser.slug));
    expect(tilesFor("2026-11-16")).toEqual(tiles);
  });

  it("move on by one article the next day", () => {
    expect(tilesFor("2026-11-17").slice(0, 6)).toEqual(tilesFor("2026-11-16").slice(1));
  });

  it("are never more than the library has, and none for a count of zero or less", () => {
    expect(tilesFor("2026-11-16", 99)).toHaveLength(ARTICLES.length);
    expect(tilesFor("2026-11-16", 0)).toEqual([]);
    expect(tilesFor("2026-11-16", -3)).toEqual([]);
  });

  it("still come for a date that is none", () => {
    expect(tilesFor("not a date", 3).map((tile) => tile.slug)).toEqual(ARTICLES.slice(0, 3).map((article) => article.slug));
  });
});

describe("tiles by address", () => {
  it("come in the order asked for", () => {
    expect(tilesOf(["2-8-seconds", "a-small-speed-bump"]).map((tile) => tile.figure)).toEqual(["×2", "36%"]);
  });

  it("leave out an address that names no article", () => {
    expect(tilesOf(["2-8-seconds", "no-such-article"]).map((tile) => tile.slug)).toEqual(["2-8-seconds"]);
    expect(tilesOf([])).toEqual([]);
  });
});

describe("the three steps of Before you start", () => {
  it("are three, each with its own id", () => {
    expect(START_STEPS.map((step) => step.id)).toEqual(["phone", "first-step", "banners"]);
  });

  it("each rest on a study of the article they link to", () => {
    for (const step of START_STEPS) {
      const article = articleBySlug(step.slug);
      expect(article, step.id).not.toBeNull();
      expect(STUDIES.some((study) => study.id === step.study), step.id).toBe(true);
      expect(article!.studies, step.id).toContain(step.study);
    }
  });

  it("use only numbers their article has", () => {
    for (const step of START_STEPS) {
      const article = JSON.stringify(articleBySlug(step.slug));
      for (const number of numbersIn(step.text)) expect(article, `${step.id}: ${number}`).toContain(number);
    }
  });

  it("have one field to type into: the first step", () => {
    expect(START_STEPS.filter((step) => step.field).map((step) => step.id)).toEqual(["first-step"]);
  });
});

describe("the three claims of the landing page", () => {
  it("each lead to an article with studies, and no two to the same", () => {
    expect(CLAIMS).toHaveLength(3);
    expect(new Set(CLAIMS.map((claim) => claim.slug)).size).toBe(3);
    for (const claim of CLAIMS) expect(articleBySlug(claim.slug)!.studies.length, claim.quote).toBeGreaterThan(0);
  });
});

describe("the first step typed before a session", () => {
  it("is kept as one line, without the spaces before it", () => {
    expect(cleanFirstStep("  Open the draft\n and   write ")).toBe("Open the draft and write ");
  });

  it("is cut at 200 characters", () => {
    expect(cleanFirstStep("a".repeat(300))).toHaveLength(FIRST_STEP_MAX);
  });

  it("is kept for the page and removed again, also where the browser gives no storage", () => {
    saveFirstStep("Read chapter 3");
    expect(readFirstStep()).toBe("Read chapter 3");
    clearFirstStep();
    expect(readFirstStep()).toBe("");
  });

  it("is not kept when it is only spaces", () => {
    saveFirstStep("   ");
    expect(readFirstStep()).toBe("");
  });
});
