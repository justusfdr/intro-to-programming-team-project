// Issue #127: the big editor must not save an event that ends less than 15 minutes after its start,
// the same rule the small "New event" window already had.
import { describe, expect, it } from "vitest";
import { cannotSave } from "./useEventSave";

const ok = { title: "Run", notes: "", allDay: false, startMin: 9 * 60, endMin: 10 * 60 };

describe("cannotSave", () => {
  it("lets a normal timed event be saved", () => {
    expect(cannotSave(ok)).toBe(false);
  });

  it("blocks an event that ends 5 minutes after the start", () => {
    expect(cannotSave({ ...ok, endMin: 9 * 60 + 5 })).toBe(true);
  });

  it("allows exactly 15 minutes", () => {
    expect(cannotSave({ ...ok, endMin: 9 * 60 + 15 })).toBe(false);
  });

  it("does not check times of an all-day event", () => {
    expect(cannotSave({ ...ok, allDay: true, endMin: 9 * 60 + 5 })).toBe(false);
  });

  it("still blocks an empty title", () => {
    expect(cannotSave({ ...ok, title: "  " })).toBe(true);
  });
});
