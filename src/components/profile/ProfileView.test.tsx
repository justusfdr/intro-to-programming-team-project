// The profile pages (spec 31). Rewritten from the settings' Profile card test (spec 28), which moved here
// with the card: the own page has the avatar, name and address at the top with "Sign out" at the top
// right, then photo (change, remove), display name, bio, LinkedIn and the time zone with the local time,
// every field labelled; Save shows only after a change; who sees it is said once; the way to People
// stays. Settings has the row "Your profile" where the card was. Another person's page is read only,
// and a LinkedIn link is rendered only in its one stored form, with the word "LinkedIn".
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SettingsView } from "@/components/settings/SettingsView";
import type { BlockerData } from "@/lib/blocker/types";
import type { OwnProfile, ProfileCardData } from "@/lib/profiles/types";
import type { SettingsPageData } from "@/lib/settings/types";
import { LinkedInLink } from "./parts";
import { PersonView } from "./PersonView";
import { ProfileView, WHO_SEES } from "./ProfileView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

// 14:20 in Lisbon (winter: UTC), 9:20 in New York.
const NOW = "2026-11-17T14:20:00.000Z";

const NO_NAME: ProfileCardData = {
  userId: "u1",
  displayName: null,
  name: "lea.martins",
  email: "lea.martins@example.com",
  photoUrl: null,
  bio: null,
  linkedinUrl: null,
  timeZone: "Europe/Lisbon",
};
const FULL: ProfileCardData = {
  ...NO_NAME,
  displayName: "Lea Martins",
  name: "Lea Martins",
  photoUrl: "/api/profiles/u1/photo?v=1",
  bio: "Statistics at Nova <b>bold</b>",
  linkedinUrl: "https://www.linkedin.com/in/lea-martins",
  timeZone: "America/New_York",
};

const own = (profile: ProfileCardData) => renderToStaticMarkup(<ProfileView profile={profile} now={NOW} />);

describe("own profile page", () => {
  it("has the initials, the fallback name and the address at the top, and Sign out at the top right", () => {
    const html = own(NO_NAME);
    const header = html.slice(0, html.indexOf("</header>"));
    expect(header).toMatch(/role="img" aria-label="Your initials, lea.martins"[^>]*>LM<\/span>/);
    expect(header).toContain(">lea.martins</h1>");
    expect(header).toContain(">lea.martins@example.com</p>");
    expect(header.indexOf("Sign out</button>")).toBeGreaterThan(header.indexOf("</h1>"));
  });

  it("offers Change photo without Remove, and the three fields, each with a real label", () => {
    const html = own(NO_NAME);
    expect(html).toContain(">Change photo</button>");
    expect(html).not.toContain(">Remove</button>");
    expect(html).toMatch(/<input[^>]*type="file"[^>]*accept="image\/jpeg,image\/png,image\/webp"/);
    expect(html).toMatch(/<label[^>]*for="([^"]+)"[^>]*>Display name<\/label><input id="\1"[^>]*value=""/);
    expect(html).toContain("people see &quot;lea.martins&quot;");
    expect(html).toMatch(/<label[^>]*for="([^"]+)"[^>]*>Bio<\/label><input id="\1"[^>]*value=""/);
    expect(html).toMatch(/<label[^>]*for="([^"]+)"[^>]*>LinkedIn<\/label><input id="\1"[^>]*placeholder="https:\/\/www.linkedin.com\/in\/your-name"/);
    // No line breaks in a bio: a one-line field, not a text area.
    expect(html).not.toContain("<textarea");
  });

  it("shows the time zone from the settings with the local time and the way to change it", () => {
    expect(own(NO_NAME)).toMatch(/Time zone: <span[^>]*>Europe\/Lisbon<\/span> · it is <time[^>]*>2:20pm<\/time> there/);
    expect(own(NO_NAME)).toMatch(/<a[^>]*href="\/settings"[^>]*>Change in Settings<\/a>/);
    expect(own(FULL)).toMatch(/America\/New York<\/span> · it is <time[^>]*>9:20am<\/time> there/);
  });

  it("says who sees the profile, keeps the way to People, and shows no Save button while nothing changed", () => {
    const html = own(FULL);
    expect(WHO_SEES).toBe("Your contacts and people you invite see your name, photo, bio, LinkedIn link and time zone.");
    expect(html).toContain(WHO_SEES);
    expect(html).toMatch(/href="\/people"/);
    expect(html).not.toContain(">Save</button>");
    expect(html).not.toContain(">Discard</button>");
  });

  it("with a photo, a name, a bio and a link: the photo from our route, Remove, the saved values in the fields", () => {
    const html = own(FULL);
    expect(html).toMatch(/<img src="\/api\/profiles\/u1\/photo\?v=1" alt="Your photo"/);
    expect(html).toContain(">Remove</button>");
    expect(html).toContain('value="Lea Martins"');
    // The bio is text, never markup.
    expect(html).toContain('value="Statistics at Nova &lt;b&gt;bold&lt;/b&gt;"');
    expect(html).not.toContain("<b>bold</b>");
    expect(html).toContain('value="https://www.linkedin.com/in/lea-martins"');
  });
});

describe("another person's profile", () => {
  it("is read only: photo, name, address, bio as text, local time and the LinkedIn link", () => {
    const html = renderToStaticMarkup(<PersonView person={FULL} now={NOW} />);
    expect(html).toMatch(/<img src="\/api\/profiles\/u1\/photo\?v=1" alt="Photo of Lea Martins"/);
    expect(html).toContain(">Lea Martins</h1>");
    expect(html).toContain(">lea.martins@example.com</p>");
    expect(html).toContain("Statistics at Nova &lt;b&gt;bold&lt;/b&gt;");
    expect(html).toMatch(/America\/New York<\/span> · it is <time[^>]*>9:20am<\/time> there/);
    expect(html).toMatch(/<a href="https:\/\/www.linkedin.com\/in\/lea-martins" target="_blank" rel="noopener noreferrer nofollow"[^>]*>LinkedIn<svg/);
    expect(html).not.toMatch(/<input|<button|Change in Settings/);
    expect(html).toMatch(/href="\/people"/);
  });

  it("without bio or link says so and shows no link", () => {
    const html = renderToStaticMarkup(<PersonView person={NO_NAME} now={NOW} />);
    expect(html).toContain("No bio yet.");
    expect(html).not.toContain("LinkedIn");
  });
});

describe("LinkedIn link", () => {
  it("is rendered only in the stored form, never another scheme or host", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "https://evil.example/in/lea", "https://www.linkedin.com/in/lea/../../x", null]) {
      expect(renderToStaticMarkup(<LinkedInLink url={bad} />)).toBe("");
    }
    expect(renderToStaticMarkup(<LinkedInLink url="https://www.linkedin.com/in/lea-m" />)).toContain('href="https://www.linkedin.com/in/lea-m"');
  });
});

describe("Settings", () => {
  it("has the row Your profile at the top where the Profile card was, and no profile fields", () => {
    const me: OwnProfile = { userId: "u1", displayName: null, name: "lea.martins", email: "lea.martins@example.com", photoUrl: null };
    const data = { settings: { timeZone: "Europe/Lisbon", homeAddress: "", travelMode: "driving", travelBufferMinutes: 10, timeFormat: "12h", dayStartHour: 7, dayEndHour: 21 }, plan: "free", outlookAvailable: false, outlook: { status: "none", lastSyncedAt: null }, today: "2026-11-17", hasDemo: false, defaultView: "week" } satisfies SettingsPageData;
    const blocker: BlockerData = { sites: [], connected: false, blockingOn: false, blockingUntil: null, timeZone: "Europe/Lisbon" };
    const html = renderToStaticMarkup(<SettingsView data={data} blocker={blocker} profile={me} />);
    expect(html).toMatch(/<a[^>]*href="\/profile"[^>]*>.*Your profile<\/span><span[^>]*>lea.martins<\/span>/s);
    expect(html.indexOf('href="/profile"')).toBeLessThan(html.indexOf(">Outlook calendar</h2>"));
    expect(html).not.toContain(">Profile</h2>");
    expect(html).not.toContain("Change photo");
    expect(html.match(/role="region"/g)).toHaveLength(5);
  });
});
