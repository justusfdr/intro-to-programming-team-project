// The end picked on the wheel or typed in the editor: a time of day (00:00 to 23:59), on the start's day
// when it is after the start, on the next day when it is at or before the start (an event past midnight).
import { describe, expect, it } from "vitest";
import { endProblem } from "@/lib/time/wheel";
import { cannotSave } from "./useEventSave";
import { endFromPicked, repeatSentence } from "./WhenSection";

const at = (h: number, m = 0) => h * 60 + m;

describe("endFromPicked", () => {
  it("keeps an end after the start on the same day", () => {
    expect(endFromPicked(at(9), at(10))).toBe(at(10));
    expect(endFromPicked(at(9), at(23, 59))).toBe(at(23, 59));
    expect(endFromPicked(at(9), at(9, 15))).toBe(at(9, 15));
  });

  it("puts an end before the start on the next day", () => {
    expect(endFromPicked(at(22), at(2))).toBe(at(26));
    expect(endFromPicked(at(22), at(0))).toBe(at(24));
    expect(endFromPicked(at(9), at(8, 45))).toBe(at(32, 45));
  });

  // Issue #128: the same time as the start used to become a 24-hour event. Now it stays equal, so
  // endProblem (and with it cannotSave) refuses it; an end on the next day stays allowed.
  it("keeps an end equal to the start, which the editor then refuses", () => {
    expect(endFromPicked(at(9), at(9))).toBe(at(9));
    expect(endProblem(at(9), endFromPicked(at(9), at(9)))).toBe("The end must be at least 15 minutes after the start");
    expect(cannotSave({ title: "x", notes: "", allDay: false, startMin: at(9), endMin: endFromPicked(at(9), at(9)) })).toBe(true);
    expect(cannotSave({ title: "x", notes: "", allDay: false, startMin: at(22), endMin: endFromPicked(at(22), at(2)) })).toBe(false);
  });
});

describe("repeatSentence", () => {
  it("says the repeat in one sentence, as in Google Calendar", () => {
    expect(repeatSentence("none", [], "2026-11-17", "2026-12-20")).toBe("Does not repeat");
    expect(repeatSentence("daily", [], "2026-11-17", "")).toBe("Every day");
    expect(repeatSentence("weekly", [4, 2], "2026-11-17", "")).toBe("Every Tue & Thu");
    expect(repeatSentence("weekly", [1, 3, 5], "2026-11-17", "")).toBe("Every Mon, Wed & Fri");
    expect(repeatSentence("weekly", [2], "2026-11-17", "")).toBe("Every Tue");
    expect(repeatSentence("weekly", [1, 2, 3, 4, 5], "2026-11-17", "")).toBe("Every weekday");
    expect(repeatSentence("weekly", [1, 2, 3, 4, 5, 6, 7], "2026-11-17", "")).toBe("Every day");
    expect(repeatSentence("monthly", [], "2026-11-17", "")).toBe("Every month on the 17th");
    for (const [day, word] of [["01", "1st"], ["02", "2nd"], ["03", "3rd"], ["11", "11th"], ["12", "12th"], ["21", "21st"], ["22", "22nd"], ["31", "31st"]]) {
      expect(repeatSentence("monthly", [], `2026-12-${day}`, "")).toBe(`Every month on the ${word}`);
    }
    expect(repeatSentence("daily", [], "2026-11-17", "2026-12-20")).toMatch(/^Every day · until .*20/);
  });
});
