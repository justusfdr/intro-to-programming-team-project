// Spec 45: the landing page says what the app does, leads to sign-in and sign-up, shows the same two
// plans as the pricing page inside the app, and every link on it leads somewhere that exists.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LegalPage from "@/app/legal/page";
import { PLANS } from "@/lib/billing/plans";
import { QUESTIONS, STEPS, TOOLS } from "./content";
import { Landing } from "./Landing";

const html = renderToStaticMarkup(<Landing />);
const legal = renderToStaticMarkup(<LegalPage />);

/** Every address a link on the page points to. */
function hrefs(markup: string): string[] {
  return [...markup.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
}

/** The text of the page without its tags, with entities for quotes and apostrophes put back. */
function textOf(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

const text = textOf(html);

describe("the landing page", () => {
  it("has one main title and says what the app is", () => {
    expect(html.match(/<h1/g)?.length).toBe(1);
    expect(text).toContain("Lock in on what matters.");
    expect(text).toContain("plans your week around your goals");
  });

  it("leads to the sign-in page and to a new account from the bar at the top", () => {
    const bar = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    expect(bar).toMatch(/href="\/sign-in"[^>]*>Log in</);
    expect(bar).toMatch(/href="\/sign-up"[^>]*>Start for free</);
    for (const label of ["How it works", "Pricing", "FAQ"]) expect(bar).toContain(`>${label}</a>`);
  });

  it("shows the three steps in order, each with its words before its picture", () => {
    let last = -1;
    for (const step of STEPS) {
      const at = html.indexOf(`>${step.title}</h3>`);
      expect(at, step.title).toBeGreaterThan(last);
      // The next picture comes after this title and before the next title.
      const picture = html.indexOf('role="img"', at);
      expect(picture, step.title).toBeGreaterThan(at);
      for (const point of step.points) expect(text).toContain(point);
      last = at;
    }
  });

  it("describes each of the four pictures in words for screen readers", () => {
    const labels = [...html.matchAll(/role="img" aria-label="([^"]+)"/g)].map((match) => match[1]);
    expect(labels).toHaveLength(4);
    for (const label of labels) expect(label.length).toBeGreaterThan(40);
  });

  it("shows the same two plans as the pricing page inside the app", () => {
    const pricing = textOf(html.slice(html.indexOf('id="pricing"'), html.indexOf('id="faq"')));
    for (const plan of PLANS) {
      expect(pricing).toContain(plan.price);
      expect(pricing).toContain(plan.summary);
      for (const feature of plan.features) expect(pricing).toContain(feature);
    }
  });

  // Changed on 20 Nov 2026 at the team's wish: Google Calendar, which was shown as "Coming soon",
  // came off the page. Every tool on it is built, and Claude, which powers the coach, joined them.
  it("shows only tools that are built: nothing is marked as coming soon", () => {
    const tools = html.slice(html.indexOf('id="tools"'), html.indexOf('id="pricing"'));
    expect(TOOLS.map((tool) => tool.name)).toEqual(["Outlook Calendar", "Claude", "Chrome", "Google Maps"]);
    expect(TOOLS.filter((tool) => tool.soon)).toEqual([]);
    expect(tools).not.toContain("Coming soon");
    for (const tool of TOOLS) expect(tools).toContain(`>${tool.name}</h3>`);
  });

  it("answers every question, the first one open", () => {
    expect(html.match(/<details/g)?.length).toBe(QUESTIONS.length);
    expect(html.match(/<details[^>]* open=""/g)?.length).toBe(1);
    for (const item of QUESTIONS) {
      expect(text).toContain(item.question);
      expect(text).toContain(item.answer);
    }
  });

  it("has the three lists at the foot: product, company and legal", () => {
    const foot = html.slice(html.indexOf("<footer"));
    for (const heading of ["Product", "Company", "Legal"]) expect(foot).toContain(`>${heading}</h2>`);
    for (const label of ["Privacy", "Terms", "Cookies"]) expect(foot).toContain(`>${label}</a>`);
  });

  it("links only to addresses that exist, and every jump has its target", () => {
    const known = new Set(["/home", "/legal", "/sign-in", "/sign-up"]);
    for (const page of [html, legal]) {
      for (const href of hrefs(page)) {
        const [path, target] = href.split("#");
        if (path) expect(known.has(path), href).toBe(true);
        if (target !== undefined) {
          const where = path === "/legal" ? legal : html;
          expect(where, href).toContain(`id="${target}"`);
        }
      }
    }
  });
});

describe("the legal notes", () => {
  it("has the three notes the foot links to", () => {
    for (const id of ["privacy", "terms", "cookies"]) expect(legal).toContain(`<section id="${id}"`);
    expect(legal.match(/<h1/g)?.length).toBe(1);
  });

  // Issue #146: the notes must name every service that receives data and say what deleting removes.
  it("names Open-Meteo as a recipient, with only rounded coordinates", () => {
    expect(legal).toContain("Open-Meteo, when the weather widget shows the weather: the coordinates of the place, rounded to about 1 km.");
  });

  it("says that deleting the account deletes our data and that payment records stay with Stripe", () => {
    expect(legal).toContain("that deletes the account and all your data in our database. Payment records stay with Stripe.");
    expect(legal).not.toContain("that removes your data");
  });
});
