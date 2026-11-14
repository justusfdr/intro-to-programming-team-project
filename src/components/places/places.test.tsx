// The shared address search pieces (used by the home address in the settings and an event's location):
// moving through the list with the arrow keys, the field's colours, the list itself, and the Location field
// as first drawn.
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocationSection } from "@/components/calendar/editor/LocationSection";
import { PlaceList, checkClass, lookUpCurrent, nextRow } from "./places";

const PLACE = { label: "Rua das Madres 66, 1200-863 Lisboa, Portugal", lat: 38.7, lon: -9.15 };

describe("nextRow", () => {
  it("goes down and up through the rows, round and round", () => {
    expect(nextRow(-1, 3, "ArrowDown")).toBe(0);
    expect(nextRow(0, 3, "ArrowDown")).toBe(1);
    expect(nextRow(2, 3, "ArrowDown")).toBe(0);
    expect(nextRow(-1, 3, "ArrowUp")).toBe(2);
    expect(nextRow(0, 3, "ArrowUp")).toBe(2);
    expect(nextRow(2, 3, "ArrowUp")).toBe(1);
  });

  it("chooses no row when there is none", () => {
    expect(nextRow(0, 0, "ArrowDown")).toBe(-1);
  });
});

describe("checkClass", () => {
  it("is green when found, red and shaking when not, plain otherwise", () => {
    expect(checkClass("found")).toContain("border-success");
    expect(checkClass("missing")).toContain("border-danger");
    expect(checkClass("missing")).toContain("address-shake");
    expect(checkClass("idle")).toBe("");
    expect(checkClass("checking")).toBe("");
  });
});

describe("the list under an address field", () => {
  it("shows the suggestions and a last row that looks up what was typed", () => {
    const html = renderToStaticMarkup(<PlaceList id="l" suggestions={[PLACE]} typed="rua das madres 66" active={-1} onPick={() => {}} onLookUp={() => {}} />);
    expect(html).toContain(">Rua das Madres 66, 1200-863 Lisboa, Portugal</li>");
    expect(html).toContain("Not listed? Look up “rua das madres 66”");
  });

  it("says just Look up when there are no suggestions", () => {
    const html = renderToStaticMarkup(<PlaceList id="l" suggestions={[]} typed="Library" active={-1} onPick={() => {}} onLookUp={() => {}} />);
    expect(html).toContain("Look up “Library”");
    expect(html).not.toContain("Not listed");
  });

  it("marks the row chosen with the arrow keys, the Look up row included", () => {
    const marked = (active: number) =>
      [...renderToStaticMarkup(<PlaceList id="l" suggestions={[PLACE]} typed="rua" active={active} onPick={() => {}} onLookUp={() => {}} />).matchAll(/aria-selected="true"/g)].length;
    expect(marked(-1)).toBe(0);
    expect(marked(0)).toBe(1);
    expect(marked(1)).toBe(1);
  });
});

describe("the Location field of an event", () => {
  it("is a search field for addresses, with no list until something is typed", () => {
    const html = renderToStaticMarkup(<LocationSection value="" editable onType={() => {}} onDone={() => {}} />);
    expect(html).toMatch(/<input aria-label="Location"[^>]*role="combobox"[^>]*aria-expanded="false"/);
    expect(html).not.toContain('role="listbox"');
    expect(html).not.toContain('role="status"');
  });

  it("an Outlook event shows its location as text, with no search (R11)", () => {
    const html = renderToStaticMarkup(<LocationSection value="Nova SBE" editable={false} onType={() => {}} onDone={() => {}} />);
    expect(html).toContain("Nova SBE");
    expect(html).not.toContain("<input");
  });
});

describe("lookUpCurrent", () => {
  const answer = (places: unknown[]) => vi.fn().mockResolvedValue({ ok: true, json: async () => ({ places }) });

  afterEach(() => vi.unstubAllGlobals());

  it("gives the answer while the field still holds the text that was sent", async () => {
    vi.stubGlobal("fetch", answer([PLACE]));
    expect(await lookUpCurrent("rua das madres 66", () => " rua das madres 66 ")).toEqual([PLACE]);
  });

  it("drops the answer when the field was changed meanwhile", async () => {
    vi.stubGlobal("fetch", answer([PLACE]));
    expect(await lookUpCurrent("rua das madres 66", () => "rua das madres 66, lisboa")).toBe("stale");
  });
});
