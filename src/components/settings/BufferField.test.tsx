// The travel buffer in Settings → Travel: chips 5, 10, 15 min and Custom; Custom shows a scrolling wheel of
// minutes 0 to 120 (the range update_settings and the database allow). A saved value that is not a chip
// shows as Custom, with the wheel on that value.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BUFFER_MINUTES, BufferField, isBufferChip } from "./BufferField";

const render = (value: number) => renderToStaticMarkup(<BufferField value={value} labelledBy="buffer" describedBy="buffer-hint" onSave={async () => true} />);

/** The radio that is checked, by its value. */
const checked = (html: string) => /<input type="radio"[^>]*checked=""[^>]*value="([^"]+)"/.exec(html)?.[1];

describe("travel buffer", () => {
  it("offers the chips 5 min, 10 min, 15 min and Custom in one labelled group", () => {
    const html = render(10);
    expect(html).toContain('role="radiogroup" aria-labelledby="buffer" aria-describedby="buffer-hint"');
    const labels = [...html.matchAll(/value="([^"]+)"\/>([^<]+)<\/label>/g)].map((m) => [m[1], m[2]]);
    expect(labels).toEqual([
      ["5", "5 min"],
      ["10", "10 min"],
      ["15", "15 min"],
      ["custom", "Custom"],
    ]);
    // The old select list is gone.
    expect(html).not.toContain("<select");
  });

  it("shows a saved chip value as that chip, without the wheel", () => {
    for (const value of [5, 10, 15]) {
      const html = render(value);
      expect(checked(html)).toBe(String(value));
      expect(html).not.toContain('aria-label="Custom buffer"');
    }
  });

  it("shows any other saved value as Custom, with the wheel on that value", () => {
    for (const value of [0, 7, 37, 120]) {
      const html = render(value);
      expect(checked(html)).toBe("custom");
      expect(html).toContain('role="group" aria-label="Custom buffer"');
      expect(html).toMatch(new RegExp(`role="option" aria-selected="true"[^>]*>${value}</div>`));
      expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    }
  });

  it("keeps the wheel within what the database allows: 0 to 120 minutes", () => {
    expect(BUFFER_MINUTES[0]).toBe(0);
    expect(BUFFER_MINUTES.at(-1)).toBe(120);
    expect(BUFFER_MINUTES).toHaveLength(121);
    const html = render(37);
    expect(html).toMatch(/role="option" aria-selected="false"[^>]*>120<\/div>/);
    expect(html).not.toMatch(/role="option"[^>]*>121<\/div>/);
  });

  it("counts only 5, 10 and 15 as chips", () => {
    expect([5, 10, 15].every(isBufferChip)).toBe(true);
    expect([0, 1, 20, 60, 120].some(isBufferChip)).toBe(false);
  });
});
