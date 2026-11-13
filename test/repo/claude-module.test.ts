// Spec 19: Claude is called from one module only, and its key is read in one place only.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const source = files(join(ROOT, "src"))
  .filter((path) => /\.(ts|tsx)$/.test(path) && !path.endsWith(".test.ts"))
  .map((path) => ({ path: relative(ROOT, path), text: readFileSync(path, "utf8") }));

describe("the Claude module", () => {
  it("is the only place that imports the Claude SDK", () => {
    expect(source.filter((f) => /from "@anthropic-ai\//.test(f.text)).map((f) => f.path)).toEqual(["src/lib/server/claude/client.ts"]);
  });

  it("reads the key only in the server's config", () => {
    expect(source.filter((f) => f.text.includes("ANTHROPIC_API_KEY")).map((f) => f.path)).toEqual(["src/lib/server/config.ts"]);
  });

  it("is never imported by browser code", () => {
    const client = source.filter((f) => f.text.startsWith('"use client"') && /server\/claude/.test(f.text));
    expect(client).toEqual([]);
  });
});
