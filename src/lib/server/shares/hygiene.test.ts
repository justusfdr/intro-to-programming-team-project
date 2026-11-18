// A check of the code itself (spec 53, E12): another user's calendar is read in exactly one place, and
// the parts that send data elsewhere or build the user's own numbers never even import the shares'
// readers. The coach (Claude, R22), Outlook, the analytics and the widgets work on the user's own rows
// only; a shared event must never reach them (R57).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..", "..", "..");
const SRC = join(ROOT, "src");

/** Every .ts and .tsx file below a folder, test files left out. */
function codeFiles(folder: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(folder)) {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) files.push(...codeFiles(path));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) files.push(path);
  }
  return files;
}

const rel = (path: string) => relative(ROOT, path).split("\\").join("/");

describe("where another user's calendar can be read (E12)", () => {
  it("app.shared_calendar is asked only in src/lib/server/shares/read.ts", () => {
    const users = codeFiles(SRC)
      .filter((file) => readFileSync(file, "utf8").includes("app.shared_calendar"))
      .map(rel);
    expect(users).toEqual(["src/lib/server/shares/read.ts"]);
  });

  it("nothing of the coach, Outlook, the analytics or the widgets imports the shares' server code", () => {
    const server = join(SRC, "lib", "server");
    const folders = ["chat", "claude", "outlook", "analytics"].map((name) => join(server, name));
    const actions = codeFiles(join(server, "actions")).filter((file) =>
      /(chat|coach|draft|message|outlook|analytics|widget)/i.test(rel(file).split("/").pop()!),
    );
    const checked = [...folders.flatMap(codeFiles), ...actions, ...codeFiles(join(SRC, "lib", "widgets"))];
    // The list is not empty: the folders above exist (a rename would otherwise pass this test silently).
    expect(checked.length).toBeGreaterThan(20);
    const importing = checked.filter((file) => /@\/lib\/server\/shares|server\/shares\//.test(readFileSync(file, "utf8"))).map(rel);
    expect(importing).toEqual([]);
  });
});
