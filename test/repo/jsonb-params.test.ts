// A JSON text sent as a query parameter must be cast `$1::text::jsonb`, never `$1::jsonb`. With `$1::jsonb`
// the real database driver (postgres) sends the text as a JSON string, so the column gets a string
// instead of a list; the temporary test database (PGlite) does not, so no action test notices it.
// It broke the Outlook sync once and saving the sidebar widgets (spec 45) a second time.
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

describe("JSON parameters", () => {
  it("are always cast through text: $1::text::jsonb", () => {
    const offenders = files(join(ROOT, "src"))
      .filter((path) => /\.(ts|tsx)$/.test(path) && !/\.test\.tsx?$/.test(path))
      .flatMap((path) =>
        readFileSync(path, "utf8")
          .split("\n")
          .map((line, i) => ({ line, at: `${relative(ROOT, path)}:${i + 1}` }))
          .filter(({ line }) => /\$\d+::jsonb\b/.test(line)),
      )
      .map(({ at }) => at);
    expect(offenders).toEqual([]);
  });
});
