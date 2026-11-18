// The time wheel as drawn: the typed field, the two columns, and the New event card using them.
// The rules behind it (which times are accepted) are tested in src/lib/time/wheel.test.ts.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DisplayProvider } from "@/components/shell/DisplayProvider";
import { DEFAULT_DISPLAY } from "@/lib/time/display";
import { NewEventForm } from "./NewEventPopover";
import { TimeField, TimeWheel } from "./TimeWheel";

const H24 = { ...DEFAULT_DISPLAY, timeFormat: "24h" as const }; // these tests pin HH:MM, the 24-hour display (issue #161: the default display is 12h)

const h24 = (node: React.ReactNode) => renderToStaticMarkup(<DisplayProvider value={H24}>{node}</DisplayProvider>);

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const options = (html: string, label: string) => {
  const column = new RegExp(`role="listbox"[^>]*aria-label="${label}"[^>]*>(.*?</div>)</div>`, "s").exec(html);
  if (!column) throw new Error(`no column ${label}`);
  return [...column[1].matchAll(/role="option" aria-selected="(true|false)"[^>]*>(\d\d)</g)].map((m) => ({ selected: m[1] === "true", text: m[2] }));
};

describe("the time field", () => {
  it("shows the time as HH:MM with two digits each", () => {
    const html = h24(<TimeField label="Start" value={9 * 60 + 5} onChange={() => {}} />);
    expect(html).toMatch(/<input[^>]*aria-label="Start"[^>]*value="09:05"/);
  });

  it("asks for numbers (the phone shows the number pad) and says HH:MM when empty", () => {
    const html = h24(<TimeField label="Start" value={0} onChange={() => {}} />);
    expect(html).toContain('inputMode="numeric"');
    // No browser length limit: it would cut a pasted " 09:30" before the digits are picked out.
    expect(html).not.toContain("maxLength");
    expect(html).toContain('placeholder="HH:MM"');
    expect(html).toContain('value="00:00"');
  });

  it("is not marked wrong and shows no message to start with", () => {
    const html = h24(<TimeField label="End" value={23 * 60 + 59} onChange={() => {}} />);
    expect(html).toContain('aria-invalid="false"');
    expect(html).not.toContain('role="alert"');
    expect(html).toContain('value="23:59"');
  });
});

describe("the wheel", () => {
  const html = h24(<TimeWheel label="Start" value={14 * 60 + 37} onChange={() => {}} />);

  it("has an hour column 00 to 23 on the left and a minute column 00 to 59 on the right", () => {
    const hours = options(html, "Start hour");
    const minutes = options(html, "Start minute");
    expect(hours.map((o) => o.text)).toEqual(Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0")));
    expect(minutes.map((o) => o.text)).toEqual(Array.from({ length: 60 }, (_, m) => String(m).padStart(2, "0")));
    expect(html.indexOf('aria-label="Start hour"')).toBeLessThan(html.indexOf('aria-label="Start minute"'));
  });

  it("marks exactly the chosen hour and minute", () => {
    expect(options(html, "Start hour").filter((o) => o.selected)).toEqual([{ selected: true, text: "14" }]);
    expect(options(html, "Start minute").filter((o) => o.selected)).toEqual([{ selected: true, text: "37" }]);
  });

  it("can be reached with the keyboard and names itself for screen readers", () => {
    expect(html).toMatch(/role="group" aria-label="Start time"/);
    expect(html).toMatch(/role="listbox" tabindex="0" aria-label="Start hour"/);
    expect(html).toMatch(/role="listbox" tabindex="0" aria-label="Start minute"/);
  });

  it("goes round and round: the numbers are laid out 23 times, but only one set is for screen readers", () => {
    const column = /role="listbox"[^>]*aria-label="Start hour"[^>]*>(.*?)<\/div><\/div>/s.exec(html)![1];
    expect(column.match(/aria-hidden="true"/g)).toHaveLength(24 * 22);
    expect(column.match(/role="option"/g)).toHaveLength(24);
    expect(column.match(/>14</g)).toHaveLength(23);
  });

  it("works at the edges of the day: 00:00 and 23:59", () => {
    const first = h24(<TimeWheel label="End" value={0} onChange={() => {}} />);
    const last = h24(<TimeWheel label="End" value={23 * 60 + 59} onChange={() => {}} />);
    expect(options(first, "End hour").find((o) => o.selected)?.text).toBe("00");
    expect(options(first, "End minute").find((o) => o.selected)?.text).toBe("00");
    expect(options(last, "End hour").find((o) => o.selected)?.text).toBe("23");
    expect(options(last, "End minute").find((o) => o.selected)?.text).toBe("59");
  });
});

describe("the New event card with the wheel", () => {
  const GOALS = [{ id: "g1", title: "Run a half marathon", look: { color: "teal" as const, icon: "footprints" as const } }];
  const card = (startMin: number, endMin: number) =>
    renderToStaticMarkup(
      <DisplayProvider value={H24}>
        <NewEventForm date="2026-11-17" startMin={startMin} endMin={endMin} goals={GOALS} onClose={() => {}} onOpenEditor={() => {}} />
      </DisplayProvider>,
    );

  it("has a typed field for start and end instead of the long list", () => {
    const html = card(9 * 60, 10 * 60 + 30);
    expect(html).toMatch(/<input[^>]*aria-label="Start"[^>]*value="09:00"/);
    expect(html).toMatch(/<input[^>]*aria-label="End"[^>]*value="10:30"/);
    expect(html).not.toContain("<select");
  });

  it("shows the length next to End", () => {
    expect(card(9 * 60, 10 * 60 + 30)).toContain(" · 1h 30m");
  });

  it("the wheel stays folded until a field is clicked", () => {
    expect(card(9 * 60, 10 * 60)).not.toContain('role="listbox"');
  });

  it("is at least 15 minutes long, even after a tiny drag", () => {
    expect(card(600, 600)).toMatch(/aria-label="End"[^>]*value="10:15"/);
  });

  it("an event dragged to midnight ends at 23:59, the wheel's last minute", () => {
    expect(card(22 * 60, 24 * 60)).toMatch(/aria-label="End"[^>]*value="23:59"/);
  });

  it("an end less than 15 minutes after the start is refused: message shown, Add stays off", () => {
    const html = card(23 * 60 + 50, 24 * 60);
    expect(html).toContain("The end must be at least 15 minutes after the start");
    expect(html).toMatch(/<button type="submit"[^>]*disabled=""[^>]*>Add<\/button>/);
  });
});

describe("with the 12-hour setting (issue #161)", () => {
  const twelve = (node: React.ReactNode) => renderToStaticMarkup(<DisplayProvider value={{ ...DEFAULT_DISPLAY, timeFormat: "12h" }}>{node}</DisplayProvider>);

  it("the field shows the time as the rest of the app does", () => {
    const html = twelve(<TimeField label="Start" value={19 * 60 + 29} onChange={() => {}} />);
    expect(html).toMatch(/<input[^>]*aria-label="Start"[^>]*value="7:29pm"/);
    expect(html).toContain('placeholder="8:30am"');
  });

  it("the hour column keeps its 24 rows, labelled 12 am to 11 pm, in a wider column; minutes stay as they are", () => {
    const html = twelve(<TimeWheel label="Start" value={20 * 60 + 30} onChange={() => {}} />);
    const hours = /aria-label="Start hour"(.*?)aria-label="Start minute"/s.exec(html)![1];
    const labels = [...hours.matchAll(/role="option"[^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(labels).toHaveLength(24);
    expect(labels[0]).toBe("12 am");
    expect(labels[12]).toBe("12 pm");
    expect(labels[23]).toBe("11 pm");
    expect(hours).toContain("w-[4.5rem]");
    expect(options(html, "Start minute")).toHaveLength(60);
  });

  it("24-hour keeps two digits and the narrow column", () => {
    const html = h24(<TimeWheel label="Start" value={0} onChange={() => {}} />);
    expect(options(html, "Start hour")[0].text).toBe("00");
    expect(html).not.toContain("w-[4.5rem]");
  });
});
