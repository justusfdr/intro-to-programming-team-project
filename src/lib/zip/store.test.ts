// The ZIP writer (spec 18): what it writes can be read back, and bad paths are refused.
import { crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { zipStore } from "./store";

const text = (value: string) => new TextEncoder().encode(value);

/** Reads a stored ZIP back through its central directory, as an unzip program does. */
function readZip(zip: Uint8Array): { path: string; data: Buffer; crc: number }[] {
  const bytes = Buffer.from(zip);
  const end = bytes.length - 22;
  expect(bytes.readUInt32LE(end)).toBe(0x06054b50);
  const count = bytes.readUInt16LE(end + 10);
  let at = bytes.readUInt32LE(end + 16);
  const files = [];
  for (let i = 0; i < count; i++) {
    expect(bytes.readUInt32LE(at)).toBe(0x02014b50);
    const crc = bytes.readUInt32LE(at + 16);
    const size = bytes.readUInt32LE(at + 24);
    const nameLength = bytes.readUInt16LE(at + 28);
    const local = bytes.readUInt32LE(at + 42);
    const path = bytes.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    expect(bytes.readUInt32LE(local)).toBe(0x04034b50);
    const dataAt = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    files.push({ path, data: bytes.subarray(dataAt, dataAt + size), crc });
    at += 46 + nameLength;
  }
  expect(at).toBe(end);
  return files;
}

describe("zipStore", () => {
  it("writes files that read back with their paths, bytes and checksums", () => {
    const zip = zipStore([
      { path: "folder/a.txt", data: text("hello") },
      { path: "folder/lib/b.js", data: text("export const b = 'ü';\n") },
      { path: "folder/empty", data: new Uint8Array() },
    ]);
    const files = readZip(zip);
    expect(files.map((f) => f.path)).toEqual(["folder/a.txt", "folder/lib/b.js", "folder/empty"]);
    expect(files[0].data.toString("utf8")).toBe("hello");
    expect(files[1].data.toString("utf8")).toBe("export const b = 'ü';\n");
    expect(files[2].data.length).toBe(0);
    for (const file of files) expect(file.crc).toBe(crc32(file.data));
  });

  it("gives the same bytes for the same files", () => {
    const files = [{ path: "a", data: text("x") }];
    expect(Buffer.from(zipStore(files)).equals(Buffer.from(zipStore(files)))).toBe(true);
  });

  it("refuses paths that are absolute, empty or climb out of the archive", () => {
    for (const path of ["", "/etc/passwd", "../x", "a/../../x", "a//b", "a\\b", "./a"]) {
      expect(() => zipStore([{ path, data: text("x") }])).toThrow("Not a valid path");
    }
  });
});
