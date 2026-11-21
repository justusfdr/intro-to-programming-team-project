// Issue #209: "Try again" on the error page must load the page's data again before it shows the page.
import { describe, expect, it } from "vitest";
import { retryPage } from "./retry-page";

describe("retryPage", () => {
  it("asks the server for the page again, then shows it, both inside the transition", () => {
    const calls: string[] = [];
    let inside = false;
    retryPage(
      () => calls.push(inside ? "refresh (in transition)" : "refresh (outside)"),
      () => calls.push(inside ? "reset (in transition)" : "reset (outside)"),
      (work) => {
        inside = true;
        work();
        inside = false;
      },
    );
    expect(calls).toEqual(["refresh (in transition)", "reset (in transition)"]);
  });

  it("does nothing until the transition runs it", () => {
    const calls: string[] = [];
    retryPage(() => calls.push("refresh"), () => calls.push("reset"), () => {});
    expect(calls).toEqual([]);
  });
});
