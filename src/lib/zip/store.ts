// A small ZIP writer: files are stored as they are, without compression. Enough for the extension's
// few small text files, and no package is needed for it. Pure: the same files give the same bytes.
import { crc32 } from "node:zlib";

export type ZipFile = { path: string; data: Uint8Array };

// 1 Jan 2026, 00:00, in the ZIP date format. Fixed, so the archive does not change between downloads.
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
// Bit 11: file names are UTF-8.
const FLAGS = 0x0800;

/** Paths use "/", are relative, and never climb out of the archive. */
function checkPath(path: string): void {
  if (path === "" || path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`Not a valid path inside a ZIP: ${path}`);
  }
}

/** The files as one ZIP archive. */
export function zipStore(files: ZipFile[]): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    checkPath(file.path);
    const name = encoder.encode(file.path);
    const sum = crc32(file.data);
    const size = file.data.byteLength;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(FLAGS, 6);
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(size, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.byteLength, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, Buffer.from(name), Buffer.from(file.data));

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4); // version made by
    entry.writeUInt16LE(20, 6); // version needed
    entry.writeUInt16LE(FLAGS, 8);
    entry.writeUInt16LE(0, 10);
    entry.writeUInt16LE(DOS_TIME, 12);
    entry.writeUInt16LE(DOS_DATE, 14);
    entry.writeUInt32LE(sum, 16);
    entry.writeUInt32LE(size, 20);
    entry.writeUInt32LE(size, 24);
    entry.writeUInt16LE(name.byteLength, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, Buffer.from(name));

    offset += 30 + name.byteLength + size;
  }

  const centralSize = central.reduce((total, part) => total + part.byteLength, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);

  return new Uint8Array(Buffer.concat([...locals, ...central, end]));
}
