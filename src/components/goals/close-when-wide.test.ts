import { describe, expect, it, vi } from "vitest";
import { closeWhenWide } from "./close-when-wide";

function fakeQuery(matches = false) {
  let listener: ((event: { matches: boolean }) => void) | null = null;
  return {
    matches,
    addEventListener: vi.fn((_: string, fn: (event: { matches: boolean }) => void) => (listener = fn)),
    removeEventListener: vi.fn(() => (listener = null)),
    fire: (now: boolean) => listener?.({ matches: now }),
    listening: () => listener !== null,
  };
}

describe("the goals sheet closes when the window becomes wide", () => {
  it("closes when the query starts to match, not when it stops", () => {
    const query = fakeQuery();
    const close = vi.fn();
    closeWhenWide(query as never, close);
    query.fire(false);
    expect(close).not.toHaveBeenCalled();
    query.fire(true);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("closes at once when the window is already wide", () => {
    const close = vi.fn();
    closeWhenWide(fakeQuery(true) as never, close);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("stops listening when cleaned up", () => {
    const query = fakeQuery();
    const stop = closeWhenWide(query as never, vi.fn());
    expect(query.listening()).toBe(true);
    stop();
    expect(query.listening()).toBe(false);
  });
});
