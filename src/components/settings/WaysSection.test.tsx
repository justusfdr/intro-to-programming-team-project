import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SettingsData } from "@/lib/settings/types";
import { WaysSection, shownWay } from "./WaysSection";

const SETTINGS: SettingsData = {
  timeZone: "Europe/Lisbon",
  homeAddress: "Rua das Madres 66, Lisboa",
  travelMode: "transit",
  travelBufferMinutes: 10,
  homeTravelMode: null,
  homeTravelBufferMinutes: null,
  timeFormat: "24h",
  dayStartHour: 8,
  dayEndHour: 20,
};
const GYM = { id: "11111111-1111-4111-8111-111111111111", name: "Gym", address: "Avenida 5", travelMode: "walking" as const, bufferMinutes: 5 };

describe("shownWay", () => {
  it("Other shows the settings' way and buffer", () => {
    expect(shownWay("other", SETTINGS, [GYM])).toEqual({ mode: "transit", buffer: 10, own: true });
  });
  it("home and a place show their own values, else Other's", () => {
    expect(shownWay("home", SETTINGS, [])).toEqual({ mode: "transit", buffer: 10, own: false });
    expect(shownWay("home", { ...SETTINGS, homeTravelBufferMinutes: 0 }, [])).toEqual({ mode: "transit", buffer: 0, own: true });
    expect(shownWay(GYM.id, SETTINGS, [GYM])).toEqual({ mode: "walking", buffer: 5, own: true });
    expect(shownWay(GYM.id, SETTINGS, [{ ...GYM, travelMode: null, bufferMinutes: null }])).toEqual({ mode: "transit", buffer: 10, own: false });
  });
  it("a place that is gone shows Other", () => {
    expect(shownWay("22222222-2222-4222-8222-222222222222", SETTINGS, [GYM])).toEqual({ mode: "transit", buffer: 10, own: true });
  });
});

describe("WaysSection", () => {
  const render = (settings: SettingsData) =>
    renderToStaticMarkup(<WaysSection settings={settings} places={[GYM]} onPlace={() => {}} save={async () => true} busy={false} />);

  it("offers Other, Home and each saved place, and starts on Other", () => {
    const html = render(SETTINGS);
    for (const label of [">Other<", ">Home<", ">Gym<", "Getting there: Other"]) expect(html).toContain(label);
  });

  it("offers no Home without a home address", () => {
    expect(render({ ...SETTINGS, homeAddress: "" })).not.toContain(">Home<");
  });
});
