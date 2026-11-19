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

describe("database functions the app must not use (security review L1)", () => {
  // The coach's people of a draft (spec 37) and the shared focus chart are not part of the app, but
  // these functions are still granted in the database. As long as no code calls them, real contact rows
  // cannot turn into a draft's invited people or a focus chart that R43 and R56 do not allow.
  // Changed 19 Nov 2026 (spec 54): the event invitation functions are used now and moved to the test below.
  const UNUSED = ["chat_draft_remove_person", "shared_focus"];

  it("no code under src/ names any of them", () => {
    const files = codeFiles(SRC);
    expect(files.length).toBeGreaterThan(100);
    const found = files.flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return UNUSED.filter((name) => text.includes(name)).map((name) => `${rel(file)}: ${name}`);
    });
    expect(found).toEqual([]);
  });
});

describe("where the event invitation functions are named (spec 54, S7)", () => {
  // Each function of 20261210000000_event_invites.sql the app uses is named in exactly one module, as
  // app.shared_calendar is: the readers in src/lib/server/invites/read.ts, the two writes in the
  // actions, and the coach's yes/no question (R63) in its calendar reader.
  const WHERE: Record<string, string> = {
    set_event_invites: "src/lib/server/actions/event-invites.ts",
    answer_event_invite: "src/lib/server/actions/event-invites.ts",
    invited_events: "src/lib/server/invites/read.ts",
    open_event_invites: "src/lib/server/invites/read.ts",
    pending_invite_count: "src/lib/server/invites/read.ts",
    event_invitees: "src/lib/server/invites/read.ts",
    own_event_invitees: "src/lib/server/invites/read.ts",
    invite_people: "src/lib/server/invites/read.ts",
    invite_person_names: "src/lib/server/invites/read.ts",
    event_has_invites: "src/lib/server/chat/rows.ts",
  };

  it("each one in exactly its one module, nowhere else under src/", () => {
    const files = codeFiles(SRC).map((file) => ({ file: rel(file), text: readFileSync(file, "utf8") }));
    for (const [name, home] of Object.entries(WHERE)) {
      // Whole names only: "event_invitees" is not found inside "own_event_invitees".
      const pattern = new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`);
      expect(files.filter((f) => pattern.test(f.text)).map((f) => f.file), name).toEqual([home]);
    }
  });

  // Added after the security review of 19 Nov 2026: the two ways around the functions above.
  it("no code reads or writes the invitations' table itself", () => {
    // The signed-in role may read a few columns of app.event_invites; the app goes through the functions only.
    const naming = codeFiles(SRC).filter((file) => /app\.event_invites(?![A-Za-z0-9_])/.test(readFileSync(file, "utf8"))).map(rel);
    expect(naming).toEqual([]);
  });

  it("app.profile_photo is asked only by the photo route, which also asks app.profile_card", () => {
    // app.profile_photo alone would hand a photo to people invited to the same event (the database's
    // app.may_see_profile is wider than R43); the route's second check is what keeps it to R43.
    const users = codeFiles(SRC).filter((file) => /from\s+app\.profile_photo\(/.test(readFileSync(file, "utf8"))).map(rel);
    expect(users).toEqual(["src/lib/server/actions/deliver-photo.ts"]);
    const route = readFileSync(join(ROOT, "src/lib/server/actions/deliver-photo.ts"), "utf8");
    expect(route).toMatch(/from\s+app\.profile_photo\(\$1::uuid\)[\s\S]{0,200}exists\s*\(select 1 from app\.profile_card\(\$1::uuid\)\)/);
  });

  it("the invitations' reader is imported only by the calendar page's loader and the invitation actions", () => {
    const importing = codeFiles(SRC)
      .filter((file) => /@\/lib\/server\/invites/.test(readFileSync(file, "utf8")))
      .map(rel)
      .sort();
    expect(importing).toEqual(["src/lib/server/actions/event-invites.ts", "src/lib/server/pages/load.ts"]);
  });
});
