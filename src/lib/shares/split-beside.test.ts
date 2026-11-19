import { describe, expect, it } from "vitest";
import { splitBeside } from "./place";

const at = (start: string, end: string) => {
  const min = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return { startMin: min(start), endMin: min(end) };
};

describe("splitBeside: who gives up width for a shared or invited block", () => {
  it("leaves own blocks at full width when the shared block runs at another time of the day", () => {
    const result = splitBeside([at("14:30", "16:30"), at("16:30", "17:30")], [at("11:00", "12:00")]);
    expect(result).toEqual({ own: [false, false], shared: [false] });
  });

  it("splits only the own block that runs at the same time", () => {
    const result = splitBeside([at("11:00", "11:30"), at("14:30", "16:30")], [at("11:00", "12:00")]);
    expect(result).toEqual({ own: [true, false], shared: [true] });
  });

  it("blocks that only touch do not count as running at the same time", () => {
    expect(splitBeside([at("10:00", "11:00")], [at("11:00", "12:00")])).toEqual({ own: [false], shared: [false] });
  });

  it("own blocks that overlap each other are decided together", () => {
    // 9:00–10:30 overlaps 10:00–11:30, which overlaps the shared 11:00–12:00: both own blocks sit in lanes.
    const result = splitBeside([at("09:00", "10:30"), at("10:00", "11:30"), at("15:00", "16:00")], [at("11:00", "12:00")]);
    expect(result).toEqual({ own: [true, true, false], shared: [true] });
  });

  it("a second shared block later in the day stays at full width when nothing of the user's is there", () => {
    const result = splitBeside([at("09:00", "10:00")], [at("09:30", "10:30"), at("18:00", "19:00")]);
    expect(result).toEqual({ own: [true], shared: [true, false] });
  });

  it("no shared blocks: nothing is split", () => {
    expect(splitBeside([at("09:00", "10:00")], [])).toEqual({ own: [false], shared: [] });
  });
});
