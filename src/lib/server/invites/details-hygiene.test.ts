// A check of the code itself (spec 55): each database function of
// 20261220000000_accepted_invite_details.sql is named in exactly one module, as the invitation functions
// of spec 54 are (src/lib/server/shares/hygiene.test.ts, S7). The readers in
// src/lib/server/invites/details.ts, the writes in the invitation actions, the goal's events in
// src/lib/server/goals/invited.ts; the internal helper nowhere.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..", "..", "..");
const SRC = join(ROOT, "src");

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

describe("where the accepted invitation's functions are named (spec 55)", () => {
  const ACTIONS = "src/lib/server/actions/event-invites.ts";
  const WHERE: Record<string, string[]> = {
    accepted_invite_details: ["src/lib/server/invites/details.ts"],
    accepted_invite_todos: ["src/lib/server/invites/details.ts"],
    accepted_invite_goal_events: ["src/lib/server/goals/invited.ts"],
    add_accepted_invite_todo: [ACTIONS],
    rename_accepted_invite_todo: [ACTIONS],
    tick_accepted_invite_todo: [ACTIONS],
    move_accepted_invite_todo: [ACTIONS],
    delete_accepted_invite_todo: [ACTIONS],
    set_accepted_invite_notes: [ACTIONS],
    set_accepted_invite_personal: [ACTIONS],
    set_accepted_invite_done: [ACTIONS],
    // Internal to the database: the functions above call it, the app never does.
    accepted_invite_row: [],
  };

  it("each one in exactly its one module, nowhere else under src/", () => {
    const files = codeFiles(SRC).map((file) => ({ file: rel(file), text: readFileSync(file, "utf8") }));
    expect(files.length).toBeGreaterThan(100);
    for (const [name, home] of Object.entries(WHERE)) {
      const pattern = new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`);
      expect(files.filter((f) => pattern.test(f.text)).map((f) => f.file), name).toEqual(home);
    }
  });

  it("the details reader is imported only by the invitation actions", () => {
    const importing = codeFiles(SRC)
      .filter((file) => /@\/lib\/server\/invites\/details/.test(readFileSync(file, "utf8")))
      .map(rel);
    expect(importing).toEqual(["src/lib/server/actions/event-invites.ts"]);
  });

  it("the coach and Outlook never read the goal's invited events (R22, R26)", () => {
    const server = join(SRC, "lib", "server");
    const checked = ["chat", "claude", "outlook"].flatMap((name) => codeFiles(join(server, name)));
    expect(checked.length).toBeGreaterThanOrEqual(5);
    expect(checked.filter((file) => /goals\/invited|accepted_invite/.test(readFileSync(file, "utf8"))).map(rel)).toEqual([]);
  });
});
