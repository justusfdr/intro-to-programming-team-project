// The open settings section survives a save (bug: choosing "Cycling" under Travel jumped back to Calendar).
// Every save re-reads the page with router.refresh(), and Next.js then writes the address it knows back
// into the browser. These tests stand in for Next.js's watch on pushState (next/dist/client/components/
// app-router.js): a call that brings Next.js's own state is taken as its own write and does not teach the
// router the new address; any other call does.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { go, sectionOf } from "./SettingsView";

type State = { __NA?: boolean } | null;

/** A browser window with Next.js's router: `refresh()` writes the router's address back, as router.refresh() does. */
function fakeWindow(start: string) {
  let url = new URL(start);
  let state: State = { __NA: true };
  // The address the router knows (Next.js's canonicalUrl).
  let routerUrl = url.href;
  const pushState = (data: State, _unused: string, next: string) => {
    url = new URL(next, url);
    state = data;
    // Next.js's own writes (marked __NA) are not copied into the router.
    if (!data?.__NA) {
      routerUrl = url.href;
      state = { ...data, __NA: true };
    }
  };
  return {
    window: {
      location: {
        get pathname() {
          return url.pathname;
        },
        get search() {
          return url.search;
        },
        get hash() {
          return url.hash;
        },
      },
      history: {
        get state() {
          return state;
        },
        pushState,
      },
      dispatchEvent: () => true,
      scrollTo: () => {},
    },
    refresh: () => {
      url = new URL(routerUrl);
    },
  };
}

describe("the open settings section after a save", () => {
  let browser: ReturnType<typeof fakeWindow>;
  beforeEach(() => {
    browser = fakeWindow("https://lockedin.test/settings");
    vi.stubGlobal("window", browser.window);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("stays on Travel when the page is re-read after choosing a way of getting there", () => {
    go("travel");
    expect(sectionOf(browser.window.location.hash)).toBe("travel");
    browser.refresh();
    expect(sectionOf(browser.window.location.hash)).toBe("travel");
  });

  it("stays on the list (no section) after going back to it on a phone and saving nothing else", () => {
    go("travel");
    go(null);
    browser.refresh();
    expect(sectionOf(browser.window.location.hash)).toBeNull();
    expect(browser.window.location.pathname).toBe("/settings");
  });
});
