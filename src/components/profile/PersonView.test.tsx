// Another person's profile page (spec 53, from specs 31 and 33): the card (photo or initials, name,
// address, bio, LinkedIn link only in its one safe form, their time zone without "Change in Settings"),
// and under it "What you share with <name>" (contacts only) and "<name>'s week". Text is never markup.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ProfileCardData } from "@/lib/profiles/types";
import { PersonView } from "./PersonView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const NOW = "2026-11-17T14:20:00.000Z";
const ANA: ProfileCardData = {
  userId: "u3",
  displayName: "Ana Silva",
  name: "Ana Silva",
  email: "ana@example.com",
  photoUrl: null,
  bio: null,
  linkedinUrl: null,
  timeZone: "Europe/Berlin",
};

describe("the card", () => {
  it("name, address, the bio as text, the LinkedIn link safely, their time zone without the settings link", () => {
    const html = renderToStaticMarkup(
      <PersonView person={{ ...ANA, bio: "<b>Stats</b> & running", linkedinUrl: "https://www.linkedin.com/in/ana-silva" }} now={NOW} />,
    );
    expect(html).toContain(">Ana Silva</h1>");
    expect(html).toContain(">ana@example.com</p>");
    expect(html).toContain("&lt;b&gt;Stats&lt;/b&gt; &amp; running");
    expect(html).toMatch(/<a href="https:\/\/www\.linkedin\.com\/in\/ana-silva" target="_blank" rel="noopener noreferrer nofollow"/);
    expect(html).toContain("Europe/Berlin");
    expect(html).not.toContain("Change in Settings");
    expect(html).not.toContain("What you share with");
  });

  it("never links anything but the LinkedIn form", () => {
    const html = renderToStaticMarkup(<PersonView person={{ ...ANA, linkedinUrl: "javascript:alert(1)" }} now={NOW} />);
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain(">LinkedIn");
  });
});

describe("the sections", () => {
  it("a contact who shares nothing: the sharing controls, Remove contact, and one quiet sentence for the week", () => {
    const html = renderToStaticMarkup(
      <PersonView person={ANA} now={NOW} sections relation={{ contactId: "c1", out: { calendar: "busy", focus: false }, shared: { calendar: "none", focus: false } }} />,
    );
    expect(html).toContain(">What you share with Ana Silva</h2>");
    expect(html).toMatch(/checked="" value="busy"/);
    expect(html).toMatch(/aria-label="Remove Ana Silva"[^>]*>Remove contact<\/button>/);
    expect(html).toContain(">Ana Silva&#x27;s week</h2>");
    expect(html).toContain("Ana Silva does not share their calendar with you.");
    expect(html).not.toContain("Show in my calendar");
    expect(html).not.toMatch(/focus chart/i);
  });

  it("a contact who shares their calendar: their week (read only, in their time zone) and Show in my calendar", () => {
    const html = renderToStaticMarkup(
      <PersonView person={ANA} now={NOW} sections viewerId="me" relation={{ contactId: "c1", out: { calendar: "none", focus: false }, shared: { calendar: "busy", focus: true } }} />,
    );
    expect(html).toContain("Shows free/busy only · Times in Europe/Berlin, their time zone");
    expect(html).toMatch(/<button[^>]*>Show in my calendar<\/button>/);
    expect(html).toContain('aria-label="Previous week"');
    expect(html).not.toMatch(/focus chart/i);
  });

  it("someone whose invitation is open: no sharing controls, no Remove, the quiet sentence for the week", () => {
    const html = renderToStaticMarkup(<PersonView person={ANA} now={NOW} sections relation={null} />);
    expect(html).not.toContain("What you share with");
    expect(html).not.toContain("Remove contact");
    expect(html).toContain("Ana Silva does not share their calendar with you.");
  });
});
