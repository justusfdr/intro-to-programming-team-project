// "<name>'s week" on a person's page (spec 53, Option B of the port plan): a read-only list of seven days
// in the person's time zone. Busy entries say "Busy" and are not buttons; details entries are buttons
// with title and place; an empty day says "Free"; an empty week says so; nothing can be dragged or edited.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { placeShared, sharedAllDayByDay, type ShownCalendar } from "@/lib/shares/place";
import type { SharingPerson } from "@/lib/shares/types";
import { addDays } from "@/lib/time/zoned";
import { PersonWeek, WeekList } from "./PersonWeek";

const ANA: SharingPerson = { userId: "u3", name: "Ana Silva", photoUrl: null, calendar: "details", focus: false };
const MONDAY = "2026-11-16";
const DATES = Array.from({ length: 7 }, (_, i) => addDays(MONDAY, i));
const ZONE = "Europe/Berlin";

function list(calendar: ShownCalendar | null) {
  const calendars = calendar ? [calendar] : [];
  return renderToStaticMarkup(
    <WeekList
      person={ANA}
      dates={DATES}
      today="2026-11-17"
      timeZone={ZONE}
      allDay={sharedAllDayByDay(calendars, DATES)}
      blocks={placeShared(calendars, DATES, ZONE)}
      onOpen={() => {}}
    />,
  );
}

describe("the week as a list", () => {
  it("details: title, place and time in their zone, as buttons; all-day first; other days Free", () => {
    const html = list({
      person: ANA,
      level: "details",
      events: [
        { allDay: false, startAt: "2026-11-17T08:00:00.000Z", endAt: "2026-11-17T10:00:00.000Z", title: "Statistics exam", location: "Room 2.14" },
        { allDay: true, firstDay: "2026-11-17", lastDay: "2026-11-17", title: "Exam day", location: null },
      ],
    });
    expect(html).toContain('<ol aria-label="Ana Silva&#x27;s week"');
    expect(html.match(/<li class="flex flex-col gap-1.5/g)).toHaveLength(7);
    expect(html).toContain("Tuesday, November 17");
    expect(html).toContain("<span class=\"sr-only\">, today</span>");
    // 08:00 UTC is 9am in Berlin.
    expect(html).toMatch(/<button[^>]*>.*9 – 11am.*Statistics exam.*Room 2\.14/);
    expect(html.indexOf("Exam day")).toBeLessThan(html.indexOf("Statistics exam"));
    expect(html.match(/>Free</g)).toHaveLength(6);
    expect(html).not.toContain("cursor-grab");
    expect(html).not.toContain("data-event-id");
  });

  it("busy: Busy without title, place or button", () => {
    const html = list({ person: ANA, level: "busy", events: [{ allDay: false, startAt: "2026-11-18T13:00:00.000Z", endAt: "2026-11-18T14:30:00.000Z" }] });
    expect(html).toContain(">Busy</span>");
    expect(html).toContain("2 – 3:30pm");
    expect(html).not.toContain("<button");
  });

  it("an empty week says so", () => {
    expect(list(null)).toContain("Nothing in Ana Silva&#x27;s calendar this week.");
  });
});

describe("PersonWeek", () => {
  it("names the level and the person's time zone, moves by weeks, and reads the week in the browser", () => {
    const html = renderToStaticMarkup(<PersonWeek person={{ ...ANA, calendar: "busy" }} timeZone="America/New_York" now="2026-11-17T14:20:00.000Z" />);
    expect(html).toContain("Shows free/busy only · Times in America/New York, their time zone");
    expect(html).toContain('aria-label="Previous week"');
    expect(html).toContain('aria-label="Next week"');
    expect(html).toContain("Nov 16 – 22");
    expect(html).toContain("Loading…");
  });

  it("says Shows details for a details share", () => {
    expect(renderToStaticMarkup(<PersonWeek person={ANA} timeZone={ZONE} now="2026-11-17T14:20:00.000Z" />)).toContain("Shows details");
  });
});
