// The settings page's markup (spec 12): the five cards in the prototype's order, every control with a
// real label, the saved values chosen, nothing about leaving times, and the typed delete confirmation.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { BlockerData } from "@/lib/blocker/types";
import type { SettingsPageData } from "@/lib/settings/types";
import { SettingsView } from "./SettingsView";
import { YourAccountCard } from "./YourAccountCard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const DATA: SettingsPageData = {
  settings: {
    timeZone: "Europe/Lisbon",
    homeAddress: "Rua Augusta 100, Lisbon",
    travelMode: "cycling",
    travelBufferMinutes: 15,
    timeFormat: "12h",
    dayStartHour: 7,
    dayEndHour: 21,
  },
  plan: "free",
  outlookAvailable: false,
  outlook: { status: "none", lastSyncedAt: null },
  today: "2026-11-17",
  hasDemo: false,
  defaultView: "week",
};

const BLOCKER: BlockerData = { sites: [{ id: "1", domain: "youtube.com" }], connected: false, blockingOn: false, blockingUntil: null, timeZone: "Europe/Lisbon" };

const render = (data: SettingsPageData = DATA) =>
  renderToStaticMarkup(<SettingsView data={data} blocker={BLOCKER} timeZones={["America/New_York", "Europe/Lisbon"]} />);

/** Every <input>/<select> id must have a <label for>, or the control sits in a labelled radio group. */
function unlabelled(html: string): string[] {
  const ids = [...html.matchAll(/<(?:input|select)(?![^>]*type="radio")[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
  return ids.filter((id) => !html.includes(`for="${id}"`));
}

describe("settings page", () => {
  it("has the title and the cards in the prototype's order", () => {
    const html = render();
    expect(html).toContain(">Settings</h1>");
    const order = ["Outlook calendar", "Preferences", "Travel", "Focus blocker", "Your account"].map((title) => html.indexOf(`>${title}</h2>`));
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html.match(/role="region"/g)).toHaveLength(5);
  });

  it("gives every field a real label", () => {
    const html = render();
    expect(unlabelled(html)).toEqual([]);
    for (const label of ["Visible from", "Visible to", "Time zone", "Home address", "Buffer", "Website to block"]) {
      expect(html).toMatch(new RegExp(`<label[^>]*for="[^"]+"[^>]*>${label}</label>`));
    }
    expect(html).toMatch(/role="radiogroup" aria-labelledby="[^"]+"/);
  });

  it("shows the saved values: 12-hour, 7am to 9pm, the time zone, the address, cycling, 15 min", () => {
    const html = render();
    expect(html).toMatch(/<input type="radio"[^>]*checked=""[^>]*value="12h"/);
    expect(html).toContain('<option value="7" selected="">7am</option>');
    expect(html).toContain('<option value="21" selected="">9pm</option>');
    expect(html).toContain('<option value="24">Midnight</option>');
    expect(html).toContain('<option value="Europe/Lisbon" selected="">Europe/Lisbon</option>');
    expect(html).toContain('value="Rua Augusta 100, Lisbon"');
    expect(html).toMatch(/<input type="radio"[^>]*checked=""[^>]*value="cycling"/);
    expect(html).toContain('<option value="15" selected="">15 min</option>');
    expect(html).toContain("Example: 1:30pm");
  });

  it("offers four ways of getting there, public transport among them, and a Confirm button for the address", () => {
    const html = render();
    for (const mode of ["driving", "cycling", "walking", "transit"]) expect(html).toMatch(new RegExp(`<input type="radio"[^>]*value="${mode}"`));
    expect(html).toContain("Public transport");
    expect(html).toMatch(/<button[^>]*>Confirm<\/button>/);
    // Suggestions only appear after typing.
    expect(html).not.toContain('role="listbox" aria-label="Address suggestions"');
  });

  it("names the map and timetable data once, as their licence asks (R27)", () => {
    const html = render();
    expect(html).toContain('href="https://www.openstreetmap.org/copyright"');
    expect(html).toContain("OpenStreetMap contributors");
    expect(html).toContain("Transitous");
  });

  it("offers the calendar's default view first in Preferences, Day, Week or Month, with the saved one chosen (spec 14)", () => {
    const html = render();
    expect(html.indexOf(">Default view<")).toBeGreaterThan(-1);
    expect(html.indexOf(">Default view<")).toBeLessThan(html.indexOf(">Time format<"));
    expect(html).toMatch(/<input type="radio"[^>]*checked=""[^>]*value="week"/);
    for (const label of ["Day", "Week", "Month"]) expect(html).toMatch(new RegExp(`value="${label.toLowerCase()}"[^>]*/>${label}</label>|value="${label.toLowerCase()}"[^>]*/><span[^>]*>${label}`));
    expect(render({ ...DATA, defaultView: "month" })).toMatch(/<input type="radio"[^>]*checked=""[^>]*value="month"/);
  });

  it("shows hours in 24-hour form when that is the setting", () => {
    const html = render({ ...DATA, settings: { ...DATA.settings, timeFormat: "24h" } });
    expect(html).toContain('<option value="7" selected="">7:00</option>');
    expect(html).toContain('<option value="24">24:00</option>');
    expect(html).toContain("Example: 13:30");
  });

  it("says nothing about leaving times yet", () => {
    expect(render()).not.toMatch(/leave by|when to leave|leave time/i);
  });

  it("offers sign out and delete account; deleting needs the typed word", () => {
    expect(render()).toContain("Sign out</button>");
    expect(render()).toContain("Delete account</button>");
    const asking = renderToStaticMarkup(<YourAccountCard defaultAsking />);
    expect(asking).toMatch(/<label for="([^"]+)"[^>]*>Type DELETE to confirm<\/label><input id="\1"/);
    expect(asking).toMatch(/<button type="submit"[^>]*disabled=""[^>]*>Delete account<\/button>/);
    expect(asking).toContain("This cannot be undone.");
  });

  it("offers 'Remove the demo data' only while demo data is left, and its question says changed demo items go too (spec 13)", () => {
    expect(render()).not.toContain("Remove the demo data");
    expect(render({ ...DATA, hasDemo: true })).toMatch(/aria-expanded="false"[^>]*>.*Remove the demo data<\/button>/);
    const asking = renderToStaticMarkup(<YourAccountCard hasDemo defaultAskingDemo />);
    expect(asking).toContain('role="group" aria-label="Remove the demo data"');
    expect(asking).toContain("Demo items you changed are removed too. Everything you added yourself stays.");
    expect(asking).toMatch(/>Cancel<\/button>/);
    expect(asking).toMatch(/>Remove<\/button>/);
  });
});
