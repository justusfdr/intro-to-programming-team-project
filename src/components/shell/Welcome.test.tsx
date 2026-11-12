// The welcome dialog's markup (spec 13): the prototype's three steps and texts, minus what is decided
// out (season, coach, week-start choice), the app's own name, and both ways to start as real radios.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Welcome } from "./Welcome";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: unknown }) => <a href={href}>{children as string}</a> }));

const render = (step: 1 | 2 | 3) => renderToStaticMarkup(<Welcome timeFormat="12h" defaultStep={step} />);

describe("welcome dialog", () => {
  it("is a dialog named after the app, with the step said in words", () => {
    const html = render(1);
    expect(html).toMatch(/^<dialog aria-label="Welcome to LockedIn"/);
    expect(html).toContain('<span class="sr-only">Step 1 of 3</span>');
  });

  it("step 1: the prototype's title, the three cards and Skip intro / Next", () => {
    const html = render(1);
    expect(html).toContain("Welcome to LockedIn");
    expect(html).toContain("Turn big goals into focused hours.");
    for (const word of [">Goals<", ">Plan<", ">Focus<", ">Skip intro<", ">Next<"]) expect(html).toContain(word);
  });

  it("step 2: the loop in three numbered rows, with Back and Next", () => {
    const html = render(2);
    expect(html).toContain("One simple loop, every week");
    expect(html.match(/<li /g)).toHaveLength(3);
    expect(html).toContain(">Back<");
  });

  it("step 3: Explore the demo (chosen) and Start fresh as radios, the time format, Connect Outlook, Get started", () => {
    const html = render(3);
    expect(html).toContain("How do you want to start?");
    const radios = html.match(/<input type="radio"[^>]*name="start-mode"[^>]*>/g) ?? [];
    expect(radios).toHaveLength(2);
    expect(radios[0]).toMatch(/checked=""[^>]*value="demo"/);
    expect(html).toContain("Explore the demo");
    expect(html).toContain("Start fresh");
    expect(html).toContain("<legend class=\"mb-1.5 text-xs text-ink-2\">Time format</legend>");
    expect(html).toContain('href="/settings#outlook"');
    expect(html).toContain(">Get started<");
  });

  it("says nothing about seasons, a coach, the week's first day or shortcuts (decided out)", () => {
    const all = [1, 2, 3].map((step) => render(step as 1 | 2 | 3)).join("");
    expect(all).not.toMatch(/season|coach|Week starts|Sunday|shortcut/i);
  });
});
