// The settings' Profile card (spec 28): photo or initials, "Change photo" and "Remove", the display
// name with Save, the address read only, every field labelled, and the way to the People page.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { BlockerData } from "@/lib/blocker/types";
import type { OwnProfile } from "@/lib/profiles/types";
import type { SettingsPageData } from "@/lib/settings/types";
import { ProfileCard } from "./ProfileCard";
import { SettingsView } from "./SettingsView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const NO_NAME: OwnProfile = { userId: "u1", displayName: null, name: "lea.martins", email: "lea.martins@example.com", photoUrl: null };
const WITH_PHOTO: OwnProfile = { ...NO_NAME, displayName: "Lea Martins", name: "Lea Martins", photoUrl: "/api/profiles/u1/photo?v=1" };

describe("Profile card", () => {
  it("without a photo: the initials, Change photo, no Remove; the name field empty with the fallback as hint", () => {
    const html = renderToStaticMarkup(<ProfileCard profile={NO_NAME} />);
    expect(html).toContain(">Profile</h2>");
    expect(html).toMatch(/role="img" aria-label="Your initials, lea.martins"[^>]*>LM<\/span>/);
    expect(html).toContain(">Change photo</button>");
    expect(html).not.toContain(">Remove</button>");
    expect(html).toMatch(/<input[^>]*type="file"[^>]*accept="image\/jpeg,image\/png,image\/webp"/);
    expect(html).toMatch(/<label[^>]*for="([^"]+)"[^>]*>Display name<\/label>.*<input id="\1"[^>]*value=""/s);
    expect(html).toContain("people see &quot;lea.martins&quot;");
    expect(html).toMatch(/<label[^>]*for="([^"]+)"[^>]*>E-mail address<\/label>.*<input id="\1"(?=[^>]*readOnly="")[^>]*value="lea.martins@example.com"/s);
    expect(html).toMatch(/href="\/people"/);
  });

  it("with a photo and a name: the photo from our route, Remove, the saved name", () => {
    const html = renderToStaticMarkup(<ProfileCard profile={WITH_PHOTO} />);
    expect(html).toMatch(/<img src="\/api\/profiles\/u1\/photo\?v=1" alt="Your photo"/);
    expect(html).toContain(">Remove</button>");
    expect(html).toMatch(/value="Lea Martins"/);
  });

  it("sits at the top of Settings when the page passes the profile", () => {
    const data = { settings: { timeZone: "Europe/Lisbon", homeAddress: "", travelMode: "driving", travelBufferMinutes: 10, timeFormat: "12h", dayStartHour: 7, dayEndHour: 21 }, plan: "free", outlookAvailable: false, outlook: { status: "none", lastSyncedAt: null }, today: "2026-11-17", hasDemo: false, defaultView: "week" } satisfies SettingsPageData;
    const blocker: BlockerData = { sites: [], connected: false, blockingOn: false, blockingUntil: null, timeZone: "Europe/Lisbon" };
    const html = renderToStaticMarkup(<SettingsView data={data} blocker={blocker} profile={NO_NAME} />);
    expect(html.indexOf(">Profile</h2>")).toBeGreaterThan(-1);
    expect(html.indexOf(">Profile</h2>")).toBeLessThan(html.indexOf(">Outlook calendar</h2>"));
    expect(html.match(/role="region"/g)).toHaveLength(6);
  });
});
