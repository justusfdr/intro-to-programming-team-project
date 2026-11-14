import { describe, expect, it, vi } from "vitest";
import { keepFocusAfterCollapse } from "./collapse-focus";

describe("focus after folding the sidebar", () => {
  it("goes to the logo link after a keyboard click", () => {
    const logo = { focus: vi.fn() };
    keepFocusAfterCollapse(0, logo);
    expect(logo.focus).toHaveBeenCalledTimes(1);
  });

  it("is left alone after a mouse click", () => {
    const logo = { focus: vi.fn() };
    keepFocusAfterCollapse(1, logo);
    expect(logo.focus).not.toHaveBeenCalled();
  });

  it("does nothing without a logo link", () => {
    expect(() => keepFocusAfterCollapse(0, null)).not.toThrow();
  });
});
