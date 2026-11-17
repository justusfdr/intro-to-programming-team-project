// Spec 47: "The research" on the landing page shows the library's articles to visitors as tiles,
// three claims with a verdict, and opens an article in a reading window on the page. It opens no
// new address: the page links nowhere new and the route guard is as it was.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ARTICLES } from "@/lib/library/articles";
import { CLAIMS } from "@/lib/library/before-you-start";
import { articleBySlug, readNext, studiesOf } from "@/lib/library/library";
import { guard, isPublic } from "@/lib/route-guard";
import { Landing } from "./Landing";
import { Reader, Research, RESEARCH_ORDER } from "./Research";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const count = (html: string, part: string) => html.split(part).length - 1;
const inHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");

const page = renderToStaticMarkup(<Landing />);
const section = renderToStaticMarkup(<Research />);
const withStudy = ARTICLES.filter((article) => article.studies.length > 0);

describe("the research on the landing page", () => {
  it("stands between How it works and Why we built it, and the bar and the foot jump to it", () => {
    const at = page.indexOf('<section id="research"');
    expect(at).toBeGreaterThan(page.indexOf('id="how"'));
    expect(at).toBeLessThan(page.indexOf('id="why"'));
    const bar = page.slice(page.indexOf("<header"), page.indexOf("</header>"));
    expect(bar).toMatch(/<a href="\/home#research"[^>]*>The research<\/a>/);
    // In the bar it comes second, after How it works and before Pricing.
    expect(bar.indexOf(">How it works</a>")).toBeLessThan(bar.indexOf(">The research</a>"));
    expect(bar.indexOf(">The research</a>")).toBeLessThan(bar.indexOf(">Pricing</a>"));
    expect(page.slice(page.indexOf("<footer"))).toMatch(/<a href="\/home#research"[^>]*>The research<\/a>/);
  });

  it("shows every article that has a study once, as a tile that opens the reading window", () => {
    expect([...RESEARCH_ORDER].sort()).toEqual(withStudy.map((article) => article.slug).sort());
    for (const article of withStudy) expect(count(section, `>Read: ${inHtml(article.title)}</span>`), article.slug).toBe(1);
    expect(count(section, '<button type="button" aria-haspopup="dialog"')).toBe(withStudy.length + CLAIMS.length);
    expect(section).toContain("9 articles · 15 studies");
  });

  it("leaves the guides out: they explain screens a visitor cannot open", () => {
    for (const guide of ARTICLES.filter((article) => article.studies.length === 0)) expect(section).not.toContain(inHtml(guide.title));
  });

  it("shows the three claims, each with its verdict", () => {
    for (const claim of CLAIMS) {
      expect(section).toContain(`“${claim.quote}”`);
      expect(section).toContain(`>${claim.verdict}</span>`);
    }
  });

  it("writes the numbers of the tiles out: the tall tile's steps and the wide tile's bars", () => {
    expect(section).toContain(">25:26<");
    expect(section).toContain("Back on the report");
    for (const text of ["22.8 min", "20.3 min", "20.6 min"]) expect(section).toContain(`>${text}<`);
  });

  it("links nowhere: the articles open on the page, and the window is empty until one is opened", () => {
    expect(section).not.toContain("href=");
    expect(section).not.toContain("<h1");
    const dialog = section.slice(section.indexOf("<dialog"));
    expect(dialog).toMatch(/^<dialog[^>]*aria-labelledby="reader-title"[^>]*><\/dialog>/);
    expect(section).not.toContain("Studies and publications");
  });
});

describe("the route guard after spec 47", () => {
  it("opens no address for the articles: a visitor still reads them on /home only", () => {
    expect(guard("/home", false)).toEqual({ kind: "allow" });
    for (const path of ["/research", "/research/2-8-seconds", "/home/research", "/focus/library", "/focus/library/2-8-seconds", "/focus"]) {
      expect(guard(path, false), path).toEqual({ kind: "redirect", to: "/sign-in" });
      expect(isPublic(path), path).toBe(false);
    }
  });
});

describe("an article in the reading window", () => {
  const article = articleBySlug("faster-and-more-stressed")!;
  const html = renderToStaticMarkup(<Reader article={article} onClose={() => {}} onOpen={() => {}} />);

  it("has its title as the window's heading, one level below the page's sections, and a close button", () => {
    expect(html).toMatch(/<h2 id="reader-title"[^>]*>Interrupted people work faster\. That is the bad news\.<\/h2>/);
    expect(html).not.toContain("<h1");
    expect(count(html, "<h2")).toBe(1);
    expect(html).toContain('aria-label="Close"');
  });

  it("writes every value of a picture out, and says what the study cannot show", () => {
    for (const text of ["22.8 min", "20.3 min", "20.6 min", "6.9", "9.5", "9.1"]) expect(html).toContain(`>${text}<`);
    expect(html).toContain("What this cannot tell you");
  });

  it("leads to a new account under Try it, not to a page a visitor cannot open", () => {
    expect(html).toMatch(/<a[^>]*href="\/sign-up"[^>]*>Start for free<\/a>/);
    expect(html).not.toContain('href="/focus');
    expect(html).not.toContain("Start a session");
  });

  it("lists its studies with a link to each publication that opens in a new tab", () => {
    for (const study of studiesOf(article)) {
      expect(html).toContain(inHtml(study.title));
      expect(html).toContain(`href="${study.url}" target="_blank" rel="noreferrer"`);
    }
    expect(count(html, 'target="_blank"')).toBe(article.studies.length);
  });

  it("offers two other articles to read next, never itself and never a guide", () => {
    const after = html.slice(html.indexOf("Read next"));
    expect(count(after, '<button type="button" aria-haspopup="dialog"')).toBe(2);
    expect(after).not.toContain(`>Read: ${inHtml(article.title)}<`);
    for (const guide of ARTICLES.filter((each) => each.studies.length === 0)) expect(after).not.toContain(inHtml(guide.title));
  });

  it("opens every article with a study, the last of a shelf too", () => {
    for (const each of withStudy) {
      const window = renderToStaticMarkup(<Reader article={each} onClose={() => {}} onOpen={() => {}} />);
      expect(window, each.slug).toContain(inHtml(each.dek));
      expect(count(window, 'target="_blank"'), each.slug).toBe(each.studies.length);
      expect(count(window.slice(window.indexOf("Read next")), ">Read: "), each.slug).toBe(2);
    }
    // "Read next" inside the app may name a guide; the window never does.
    expect(readNext(articleBySlug("decide-before-the-moment")!).length).toBe(2);
  });
});
