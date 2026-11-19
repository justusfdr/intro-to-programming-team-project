// The day view keeps the week's height for its all-day row: as many rows as the week view packs.
import { describe, expect, it } from "vitest";
import type { AllDayEvent } from "@/lib/events/types";
import { allDayRowCount } from "./TimeGrid";

const WEEK = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"];
const bar = (id: string, firstDay: string, lastDay: string) => ({ id, title: id, firstDay, lastDay }) as unknown as AllDayEvent;

describe("rows of all-day bars in a week", () => {
  it("no events: no row", () => {
    expect(allDayRowCount([], WEEK)).toBe(0);
  });

  it("bars on different days share one row", () => {
    expect(allDayRowCount([bar("a", "2026-11-16", "2026-11-17"), bar("b", "2026-11-18", "2026-11-18"), bar("c", "2026-11-20", "2026-11-22")], WEEK)).toBe(1);
  });

  it("overlapping bars take a row each; a later bar fills the first free row", () => {
    const events = [bar("a", "2026-11-16", "2026-11-19"), bar("b", "2026-11-18", "2026-11-18"), bar("c", "2026-11-17", "2026-11-18"), bar("d", "2026-11-20", "2026-11-20")];
    expect(allDayRowCount(events, WEEK)).toBe(3);
  });

  it("a bar reaching into the week from before or past it counts only its days in this week", () => {
    expect(allDayRowCount([bar("a", "2026-11-10", "2026-11-16"), bar("b", "2026-11-17", "2026-11-30")], WEEK)).toBe(1);
  });
});
