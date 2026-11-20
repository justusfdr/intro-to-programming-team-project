// Spec 62: under "How it works" the landing page tells one day in six stops. The three steps of
// spec 45 are three of them, with their words, links and pictures; the page reads the same without
// a script, and it links nowhere new.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { clockText } from "@/lib/landing/story";
import { STEPS, STORY, STORY_DAY } from "./content";
import { DayStory } from "./DayStory";
import { Landing } from "./Landing";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const html = renderToStaticMarkup(<DayStory />);
const page = renderToStaticMarkup(<Landing />);

/** The text without its tags, with entities for apostrophes and ampersands put back. */
function textOf(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

/** The markup of each stop, in the order of the page. */
const stops = html.split("data-story-stop").slice(1);

describe("the six stops of the day", () => {
  it("are six, each a stretch of the day that begins where the one before ended", () => {
    expect(STORY.map((stop) => stop.id)).toEqual(["goal", "plan", "focus", "travel", "reach", "report"]);
    expect(STORY[0].from).toBe(STORY_DAY.from);
    expect(STORY[STORY.length - 1].to).toBe(STORY_DAY.to);
    STORY.forEach((stop, at) => {
      expect(stop.to, stop.id).toBeGreaterThan(stop.from);
      if (at > 0) expect(stop.from, stop.id).toBe(STORY[at - 1].to);
    });
  });

  it("show a time that lies in their stretch, or just before it for the first minutes of a stop", () => {
    for (const stop of STORY) {
      const minutes = [...Array(stop.to - stop.from + 1).keys()].map((offset) => stop.from + offset);
      expect(minutes.map(clockText), stop.id).toContain(stop.time);
    }
  });

  it("stand on the page in the order of the day, each with its time, its title and its words", () => {
    expect(stops).toHaveLength(STORY.length);
    STORY.forEach((stop, at) => {
      const text = textOf(stops[at]);
      expect(stops[at], stop.id).toContain(`>${stop.title}</h3>`);
      expect(text, stop.id).toContain(stop.time);
      expect(text, stop.id).toContain(stop.tag);
      expect(text, stop.id).toContain(stop.text);
      for (const point of stop.points) expect(text, stop.id).toContain(point);
    });
  });

  it("put the words before the picture in every stop", () => {
    for (const stop of stops) {
      const parts = [...stop.matchAll(/data-story-part/g)].map((match) => match.index);
      expect(parts).toHaveLength(2);
      const picture = stop.indexOf("data-story-fit");
      expect(stop.indexOf("</h3>")).toBeLessThan(picture);
      expect(parts[1]).toBeLessThan(picture);
    }
  });
});

describe("the three steps inside the day", () => {
  const byId = new Map(STORY.map((stop) => [stop.id, stop]));

  it("keep their own words", () => {
    for (const step of STEPS) {
      const stop = byId.get(step.id);
      expect(stop, step.id).toBeDefined();
      expect(stop).toMatchObject({ tag: step.tag, title: step.title, text: step.text, points: step.points });
    }
  });

  it("keep their way on to a new account, and the new stops add no link", () => {
    STORY.forEach((stop, at) => {
      const links = [...stops[at].matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)/g)].map((match) => [match[1], match[2]]);
      const isStep = STEPS.some((step) => step.id === stop.id);
      expect(Boolean(stop.link), stop.id).toBe(isStep);
      expect(links, stop.id).toEqual(isStep ? [["/sign-up", stop.link]] : []);
    });
  });

  it("keep their pictures with a description; the three new pictures are decoration", () => {
    STORY.forEach((stop, at) => {
      const described = (stops[at].match(/role="img" aria-label="/g) ?? []).length;
      expect(described, stop.id).toBe(STEPS.some((step) => step.id === stop.id) ? 1 : 0);
      // Every picture is hidden from screen readers below its description, or as a whole.
      const picture = stops[at].slice(stops[at].indexOf("data-story-fit"));
      expect(picture, stop.id).toContain('aria-hidden="true"');
    });
  });
});

describe("the day beside the stops", () => {
  it("is decoration, starts at the first hour and holds the events the story plans", () => {
    const rail = html.slice(0, html.indexOf("data-story-stop"));
    expect(rail).toMatch(/aria-hidden="true"[^>]*class="story-rail/);
    expect(rail).toContain(`>${clockText(STORY_DAY.from)}<`);
    for (const title of ["Thesis: chapter 3", "Group project", "Tempo run"]) expect(rail).toContain(title);
  });

  it("only suggests and adds events while the coach is planning", () => {
    const plan = STORY.find((stop) => stop.id === "plan");
    const times = [...html.matchAll(/data-(suggested|added)="(\d+)"/g)].map((match) => Number(match[2]));
    expect(times.length).toBe(4);
    for (const time of times) {
      expect(time).toBeGreaterThan(plan?.from ?? Infinity);
      expect(time).toBeLessThan(plan?.to ?? -Infinity);
    }
  });
});

describe("the story on the landing page", () => {
  it("stands under How it works, before the research", () => {
    const at = page.indexOf("data-story-stage");
    expect(at).toBeGreaterThan(page.indexOf('id="how"'));
    expect(at).toBeLessThan(page.indexOf('id="research"'));
  });

  it("has every stop title once", () => {
    for (const stop of STORY) expect(page.split(`>${stop.title}</h3>`).length - 1, stop.id).toBe(1);
  });
});
