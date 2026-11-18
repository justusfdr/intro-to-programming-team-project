// The profile page (spec 40): the avatar, name and address at the top with "Sign out" at the top right,
// then photo (change, remove), display name, bio, LinkedIn and the time zone with the local time, every
// field labelled; Save shows only after a change; who sees the profile is said once (spec 53: contacts
// and the people the user invites), and nothing else on the page speaks of other people. Settings has the row "Your profile" at the top.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SettingsView } from "@/components/settings/SettingsView";
import type { BlockerData } from "@/lib/blocker/types";
import type { OwnProfile, ProfileCardData } from "@/lib/profiles/types";
import type { SettingsPageData } from "@/lib/settings/types";
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

describe("profile page", () => {
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
    expect(html).toContain("LockedIn shows &quot;lea.martins&quot;");
    expect(html).toMatch(/<label[^>]*for="([^"]+)"[^>]*>Bio<\/label><input id="\1"[^>]*value=""/);
    expect(html).toMatch(/<label[^>]*for="([^"]+)"[^>]*>LinkedIn<\/label><input id="\1"[^>]*placeholder="https:\/\/www.linkedin.com\/in\/your-name"/);
    // No line breaks in a bio: a one-line field, not a text area.
    expect(html).not.toContain("<textarea");
  });

  it("with a photo: says to choose it again to move it; the placing dialog is closed and empty until a picture is chosen", () => {
    const html = own(FULL);
    expect(html).toContain("Choose the photo again to move it.");
    expect(own(NO_NAME)).not.toContain("Choose the photo again to move it.");
    expect(html).toMatch(/<dialog aria-labelledby="photo-dialog-title"[^>]*><\/dialog>/);
  });

  it("shows the time zone from the settings with the local time and the way to change it, read only", () => {
    expect(own(NO_NAME)).toMatch(/Time zone: <span[^>]*>Europe\/Lisbon<\/span> · it is <time[^>]*>2:20pm<\/time> there/);
    expect(own(NO_NAME)).toMatch(/<a[^>]*href="\/settings"[^>]*>Change in Settings<\/a>/);
    expect(own(FULL)).toMatch(/America\/New York<\/span> · it is <time[^>]*>9:20am<\/time> there/);
    expect(own(FULL)).not.toMatch(/<select|name="timeZone"/);
  });

  it("says only the user sees it, speaks of nobody else, and shows no Save button while nothing changed", () => {
    expect(WHO_SEES).toBe("Your contacts and the people you invite see your name, photo, e-mail address, bio, LinkedIn link and time zone.");
    for (const html of [own(FULL), own(NO_NAME)]) {
      expect(html).toContain(WHO_SEES);
      // Spec 53: apart from that sentence, nothing on the page speaks of other people.
      expect(html.replace(WHO_SEES, "")).not.toMatch(/contact|invit|people|shar|\/people/i);
      expect(html).not.toContain(">Save</button>");
      expect(html).not.toContain(">Discard</button>");
    }
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

describe("Settings", () => {
  const data = {
    settings: { timeZone: "Europe/Lisbon", homeAddress: "", travelMode: "driving", travelBufferMinutes: 10, timeFormat: "12h", dayStartHour: 7, dayEndHour: 21 },
    plan: "free",
    outlookAvailable: false,
    outlook: { status: "none", lastSyncedAt: null },
    today: "2026-11-17",
    hasDemo: false,
    defaultView: "week",
    places: [],
  } satisfies SettingsPageData;
  const blocker: BlockerData = { sites: [], connected: false, blockingOn: false, blockingUntil: null, timeZone: "Europe/Lisbon" };

  it("has the row Your profile at the top, before the cards, and no profile fields", () => {
    const me: OwnProfile = { userId: "u1", displayName: null, name: "lea.martins", email: "lea.martins@example.com", photoUrl: null };
    const html = renderToStaticMarkup(<SettingsView data={data} blocker={blocker} profile={me} />);
    expect(html).toMatch(/<a[^>]*href="\/profile"[^>]*>.*Your profile<\/span><span[^>]*>lea.martins<\/span>/s);
    expect(html.indexOf('href="/profile"')).toBeLessThan(html.indexOf(">Outlook calendar</h2>"));
    expect(html).not.toContain("Change photo");
    expect(html.match(/role="region"/g)).toHaveLength(5);
  });

  it("without the profile loaded: no row", () => {
    expect(renderToStaticMarkup(<SettingsView data={data} blocker={blocker} />)).not.toContain('href="/profile"');
  });
});
