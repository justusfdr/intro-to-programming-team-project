// The extension's download (spec 18): the project's real `extension` folder as a ZIP, with this app's
// address in config.js, without tests and developer notes, and nothing else changed.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { configFor, EXTENSION_FOLDER, extensionZip } from "./package";

const DIR = path.join(process.cwd(), "extension");

/** The stored files of a ZIP by path (the writer itself is tested in src/lib/zip/store.test.ts). */
function filesOf(zip: Uint8Array): Map<string, string> {
  const bytes = Buffer.from(zip);
  const end = bytes.length - 22;
  let at = bytes.readUInt32LE(end + 16);
  const files = new Map<string, string>();
  for (let i = 0; i < bytes.readUInt16LE(end + 10); i++) {
    const size = bytes.readUInt32LE(at + 24);
    const nameLength = bytes.readUInt16LE(at + 28);
    const local = bytes.readUInt32LE(at + 42);
    const dataAt = local + 30 + bytes.readUInt16LE(local + 26);
    files.set(bytes.subarray(at + 46, at + 46 + nameLength).toString("utf8"), bytes.subarray(dataAt, dataAt + size).toString("utf8"));
    at += 46 + nameLength;
  }
  return files;
}

describe("the extension as a download", () => {
  it("holds the extension's files in one folder, with the app's address in config.js", async () => {
    const files = filesOf(await extensionZip("https://lockin.example.com"));
    const names = [...files.keys()];
    expect(names.every((name) => name.startsWith(`${EXTENSION_FOLDER}/`))).toBe(true);
    for (const needed of ["manifest.json", "background.js", "config.js", "blocked.html", "blocked.js", "blocked.css", "lib/answer.js", "lib/attempts.js"]) {
      expect(names).toContain(`${EXTENSION_FOLDER}/${needed}`);
    }
    expect(files.get(`${EXTENSION_FOLDER}/config.js`)).toContain('export const APP_URL = "https://lockin.example.com";');
    expect(files.get(`${EXTENSION_FOLDER}/config.js`)).not.toContain("http://localhost:3000\";");
  });

  it("leaves tests and developer notes out, and every other file unchanged", async () => {
    const files = filesOf(await extensionZip("http://localhost:3000"));
    const names = [...files.keys()];
    expect(names.some((name) => name.endsWith(".test.js") || name.endsWith("README.md"))).toBe(false);
    for (const same of ["manifest.json", "background.js", "lib/answer.js"]) {
      expect(files.get(`${EXTENSION_FOLDER}/${same}`)).toBe(await readFile(path.join(DIR, same), "utf8"));
    }
  });

  it("keeps the extension's id: the manifest still carries the public key", async () => {
    const manifest = JSON.parse(filesOf(await extensionZip("http://localhost:3000")).get(`${EXTENSION_FOLDER}/manifest.json`) ?? "{}");
    expect(manifest.key).toMatch(/^MIIBIjAN/);
  });

  it("writes only the origin, as a quoted string", () => {
    const source = 'export const APP_URL = "http://localhost:3000";\nexport const POLL_MINUTES = 1;\n';
    expect(configFor(source, "https://lockin.example.com/some/path?x=1")).toBe('export const APP_URL = "https://lockin.example.com";\nexport const POLL_MINUTES = 1;\n');
  });

  it("refuses an address that is not a web address, and a config without the line", () => {
    const source = 'export const APP_URL = "http://localhost:3000";\n';
    for (const bad of ["", "not a url", "javascript:alert(1)", 'x";alert(1);//']) {
      expect(() => configFor(source, bad)).toThrow("not a web address");
    }
    expect(() => configFor("export const OTHER = 1;\n", "https://lockin.example.com")).toThrow("no APP_URL line");
  });

  it("refuses a folder without a manifest", async () => {
    await expect(extensionZip("http://localhost:3000", path.join(DIR, "lib"))).rejects.toThrow("no manifest.json");
  });
});
