import { describe, expect, it } from "vitest";
import { cleanDomain } from "./domain";

describe("cleanDomain (R17)", () => {
  it.each([
    ["https://www.Instagram.com/reels", "instagram.com"],
    ["instagram.com", "instagram.com"],
    ["  YouTube.com  ", "youtube.com"],
    ["www.reddit.com/r/all?x=1#top", "reddit.com"],
    ["http://news.ycombinator.com:8080/item", "news.ycombinator.com"],
    ["mail.google.com", "mail.google.com"],
    ["x.com.", "x.com"],
    ["bücher.de", "xn--bcher-kva.de"],
  ])("cleans %j to %j", (input, expected) => {
    expect(cleanDomain(input)).toBe(expected);
  });

  it.each(["not a site", "", "   ", "localhost", "instagram", "192.168.1.1", "http://", "ftp//x", "a..com", "-a.com", "x".repeat(250) + ".com"])(
    "refuses %j",
    (input) => {
      expect(cleanDomain(input)).toBeNull();
    },
  );
});
