// The library's pages as markup (spec 29): the front page with its shelves and tiles, an article
// with its pictures, its limits and its studies, and a guide, which has no studies.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ARTICLES } from "@/lib/library/articles";
import { articleBySlug, articlesOn, readNext, studiesOf } from "@/lib/library/library";
import { STUDIES } from "@/lib/library/studies";
import { ArticleView } from "./ArticleView";
import { BarsFigure } from "./Figures";
import { LibraryView } from "./LibraryView";
import { StudyCard } from "./StudyCard";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

/** Text as it stands in markup. */
const inHtml = (text: string) => text.replaceAll("&", "&amp;").replaceAll("'", "&#x27;").replaceAll('"', "&quot;");
const count = (html: string, part: string) => html.split(part).length - 1;

describe("the library's front page", () => {
  it("shows every article once, as a link to its page, with its shelf and reading time", () => {
    const html = renderToStaticMarkup(<LibraryView topic={null} />);
    for (const article of ARTICLES) {
      expect(count(html, `href="/focus/library/${article.slug}"`), article.slug).toBe(1);
      expect(html).toContain(inHtml(article.title));
    }
    expect(html).toContain("9 articles · 15 studies · 2 guides");
    expect(html).toMatch(/\d min read · 2 studies/);
    expect(html).toContain("min read · Guide");
  });

  it("marks All as the shelf it is on and makes the first tile the large one", () => {
    const html = renderToStaticMarkup(<LibraryView topic={null} />);
    expect(html).toMatch(/<a href="\/focus\/library" aria-current="page"[^>]*>All<\/a>/);
    expect(count(html, 'aria-current="page"')).toBe(1);
    expect(count(html, "md:col-span-2")).toBe(1);
    expect(html.indexOf("md:col-span-2")).toBeLessThan(html.indexOf(inHtml(ARTICLES[1].title)));
  });

  it("shows one shelf only when the address names it", () => {
    const html = renderToStaticMarkup(<LibraryView topic="phones" />);
    for (const article of articlesOn("phones")) expect(html).toContain(`href="/focus/library/${article.slug}"`);
    expect(html).not.toContain('href="/focus/library/2-8-seconds"');
    expect(html).toMatch(/<a href="\/focus\/library\?topic=phones" aria-current="page"[^>]*>Phones and feeds<\/a>/);
    expect(html).not.toContain("md:col-span-2");
  });

  it("leads back to the Focus page", () => {
    expect(renderToStaticMarkup(<LibraryView topic={null} />)).toMatch(/<a href="\/focus"[^>]*>.*Focus<\/a>/);
  });
});

describe("an article", () => {
  const article = articleBySlug("faster-and-more-stressed")!;
  const html = renderToStaticMarkup(<ArticleView article={article} />);

  it("has its title as the page's heading, its shelf, and the way back to the library", () => {
    expect(html).toMatch(/<h1[^>]*>Interrupted people work faster\. That is the bad news\.<\/h1>/);
    expect(count(html, "<h1")).toBe(1);
    expect(html).toMatch(/<a href="\/focus\/library\?topic=interruptions"[^>]*>Interruptions<\/a>/);
    expect(html).toMatch(/<a href="\/focus\/library"[^>]*>.*Library<\/a>/);
  });

  it("writes every value of a picture out, next to its bar", () => {
    expect(html).toContain("Time to finish the emails");
    for (const text of ["22.8 min", "20.3 min", "20.6 min", "6.9", "9.5", "9.1"]) expect(html).toContain(`>${text}<`);
  });

  it("says what the study cannot show, and what to try, with the way to a session", () => {
    expect(html).toContain("What this cannot tell you");
    expect(html).not.toContain("Good to know");
    expect(html).toContain("Try it");
    expect(html).toMatch(/<a href="\/focus"[^>]*>.*Start a session<\/a>/);
  });

  it("lists its studies with a link to each publication that opens in a new tab", () => {
    expect(html).toContain("Studies and publications");
    for (const study of studiesOf(article)) {
      expect(html).toContain(inHtml(study.title));
      expect(html).toContain(`href="${study.url}" target="_blank" rel="noreferrer"`);
    }
    expect(html).toContain("2008 · ACM Conference on Human Factors in Computing Systems (CHI)");
    expect(html).toContain("(opens in a new tab)");
  });

  it("offers two other articles to read next, never itself", () => {
    const after = html.slice(html.indexOf("Read next"));
    for (const next of readNext(article)) expect(after).toContain(`href="/focus/library/${next.slug}"`);
    expect(count(after, 'href="/focus/library/')).toBe(2);
    expect(after).not.toContain(`href="/focus/library/${article.slug}"`);
  });

  it("renders every article and guide of the library", () => {
    for (const each of ARTICLES) {
      const page = renderToStaticMarkup(<ArticleView article={each} />);
      expect(page, each.slug).toContain(inHtml(each.dek));
      expect(count(page, 'target="_blank"'), each.slug).toBe(each.studies.length);
    }
  });
});

describe("a guide", () => {
  const html = renderToStaticMarkup(<ArticleView article={articleBySlug("make-the-blocker-yours")!} />);

  it("has no list of studies, and its limits are called Good to know", () => {
    expect(html).not.toContain("Studies and publications");
    expect(html).not.toContain("What this cannot tell you");
    expect(html).toContain("Good to know");
    expect(html).toContain("min read · Guide");
  });

  it("numbers its steps", () => {
    expect(html).toMatch(/>1<\/span>.*Install the extension.*>2<\/span>.*Edit your list.*>3<\/span>/s);
  });
});

describe("a study's card", () => {
  it("says Peer-reviewed for a journal article", () => {
    const html = renderToStaticMarkup(<StudyCard study={STUDIES.find((study) => study.id === "altmann-2014")!} />);
    expect(html).toContain("Peer-reviewed");
    expect(html).toContain("Lab experiment");
    expect(html).toContain("Altmann, Trafton, Hambrick");
  });

  it("does not say it for a chapter in an edited series", () => {
    const html = renderToStaticMarkup(<StudyCard study={STUDIES.find((study) => study.id === "gollwitzer-2006")!} />);
    expect(html).not.toContain("Peer-reviewed");
    expect(html).toContain("Meta-analysis");
  });
});

describe("bars", () => {
  it("start at zero: the longest fills the row, the others their share of it", () => {
    const html = renderToStaticMarkup(
      <BarsFigure title="T" bars={[{ label: "A", value: 20, text: "20" }, { label: "B", value: 5, text: "5", strong: true }]} />,
    );
    expect(html).toContain("width:100%");
    expect(html).toContain("width:25%");
  });

  it("keep a sliver for a value close to zero, so the bar can still be seen", () => {
    const html = renderToStaticMarkup(
      <BarsFigure title="T" bars={[{ label: "A", value: 1000, text: "1000" }, { label: "B", value: 1, text: "1" }]} />,
    );
    expect(html).toContain("width:2%");
  });
});
