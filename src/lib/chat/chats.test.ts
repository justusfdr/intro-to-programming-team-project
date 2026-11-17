// Spec 44: a chat's title and the chats grouped by day for the list.
import { describe, expect, it } from "vitest";
import { CHAT_TITLE_MAX, chatDayLabel, chatDays, chatTitleOf } from "./chats";

describe("chatTitleOf", () => {
  it("puts the first message on one line, trimmed", () => {
    expect(chatTitleOf("  Plan my\n\nSaturday   please ")).toBe("Plan my Saturday please");
  });

  it("cuts it to 80 characters without a trailing space", () => {
    const long = `${"a".repeat(79)} bcd`;
    expect(chatTitleOf(long)).toBe("a".repeat(79));
    expect(chatTitleOf("x".repeat(200))).toHaveLength(CHAT_TITLE_MAX);
  });

  it("counts characters, so an emoji at the cut is kept whole", () => {
    const title = chatTitleOf(`${"a".repeat(79)}🏃‍ run`);
    expect(Array.from(title)).toHaveLength(CHAT_TITLE_MAX);
    expect(title.endsWith("🏃")).toBe(true);
  });

  it("is 'Chat' when nothing is left", () => {
    expect(chatTitleOf("   \n ")).toBe("Chat");
  });
});

describe("chatDayLabel", () => {
  it("says Today, Yesterday, else the short date", () => {
    expect(chatDayLabel("2026-11-17", "2026-11-17")).toBe("Today");
    expect(chatDayLabel("2026-11-16", "2026-11-17")).toBe("Yesterday");
    expect(chatDayLabel("2026-11-13", "2026-11-17")).toBe("Fri, Nov 13");
  });
});

describe("chatDays", () => {
  const chat = (id: string, updatedAt: string) => ({ id, title: id, updatedAt });

  it("groups by the local day of the latest message, newest day and newest chat first", () => {
    const days = chatDays(
      [
        chat("old", "2026-11-13T10:00:00.000Z"),
        chat("morning", "2026-11-17T08:00:00.000Z"),
        chat("evening", "2026-11-17T19:00:00.000Z"),
        chat("yesterday", "2026-11-16T12:00:00.000Z"),
      ],
      new Date("2026-11-17T20:00:00.000Z"),
      "Europe/Lisbon",
    );
    expect(days.map((d) => [d.label, d.chats.map((c) => c.id)])).toEqual([
      ["Today", ["evening", "morning"]],
      ["Yesterday", ["yesterday"]],
      ["Fri, Nov 13", ["old"]],
    ]);
  });

  it("uses the user's time zone for the day", () => {
    // 23:30 UTC on the 16th is already the 17th in Berlin.
    const days = chatDays([chat("late", "2026-11-16T23:30:00.000Z")], new Date("2026-11-17T09:00:00.000Z"), "Europe/Berlin");
    expect(days[0].label).toBe("Today");
  });

  it("counts a chat dated after today as today, and is empty without chats", () => {
    expect(chatDays([chat("ahead", "2026-11-18T09:00:00.000Z")], new Date("2026-11-17T09:00:00.000Z"), "UTC")[0].label).toBe("Today");
    expect(chatDays([], new Date(), "UTC")).toEqual([]);
  });
});
