// Checks on the code itself that keep the security model intact (spec 01: no secret in the repository,
// one module per external service, server code marked server-only).
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
  .filter((path) => /\.(ts|tsx)$/.test(path))
  .map((path) => ({ path: relative(ROOT, path), text: readFileSync(path, "utf8") }));

function importers(module: RegExp): string[] {
  return source.filter((file) => module.test(file.text)).map((file) => file.path);
}

describe("repository hygiene", () => {
  it("marks every module under src/lib/server as server-only", () => {
    const missing = source
      .filter((file) => file.path.startsWith("src/lib/server/") && !file.path.endsWith(".test.ts"))
      .filter((file) => !file.text.startsWith('import "server-only";'))
      .map((file) => file.path);
    expect(missing).toEqual([]);
  });

  it("never uses a NEXT_PUBLIC_ variable (nothing configurable reaches the browser)", () => {
    expect(importers(/NEXT_PUBLIC_/)).toEqual([]);
  });

  it("connects to the database only in the database module", () => {
    expect(importers(/from "postgres"/)).toEqual(["src/lib/server/db/index.ts"]);
  });

  it("calls Supabase only in the Supabase Auth module", () => {
    expect(importers(/from "@supabase\//)).toEqual(["src/lib/server/auth/supabase.ts"]);
  });

  it("keeps .env files out of git and only placeholders in .env.example", () => {
    const ignore = readFileSync(join(ROOT, ".gitignore"), "utf8");
    expect(ignore).toMatch(/^\.env\*$/m);
    const example = readFileSync(join(ROOT, ".env.example"), "utf8");
    // Real Supabase secret keys and JWTs have these shapes.
    expect(example).not.toMatch(/sb_secret_|eyJ[A-Za-z0-9_-]{10,}/);
    for (const line of example.split("\n").filter((l) => /^[A-Z_]+=/.test(l))) {
      expect(line, line).toMatch(/localhost|placeholder|your-/);
    }
  });
});
