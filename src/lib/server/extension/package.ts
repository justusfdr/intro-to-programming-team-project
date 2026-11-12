import "server-only";

// The Chrome extension as a ZIP to download (spec 18). The files come from the project's `extension`
// folder, unchanged, except one line: config.js gets this app's own address, so the downloaded
// extension follows the app it was downloaded from and nothing has to be edited by hand.
// The folder holds no secrets (R16: the extension has no keys).
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { zipStore, type ZipFile } from "@/lib/zip/store";

/** The folder inside the ZIP, and the one the user picks in Chrome. */
export const EXTENSION_FOLDER = "lock-in-blocker";
export const EXTENSION_ZIP_NAME = "lock-in-blocker.zip";

const APP_URL_LINE = /^export const APP_URL = .*;$/m;

/** Tests and notes for developers stay out of the download. */
function wanted(name: string): boolean {
  return !name.startsWith(".") && !name.endsWith(".test.js") && name !== "README.md";
}

async function listFiles(dir: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!wanted(entry.name)) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...(await listFiles(path.join(/* turbopackIgnore: true */ dir, entry.name), relative)));
    else if (entry.isFile()) found.push(relative);
  }
  return found;
}

/** config.js with the app's address. Throws when the address is not a plain http(s) origin. */
export function configFor(source: string, appUrl: string): string {
  let origin: string;
  try {
    const url = new URL(appUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("not http");
    origin = url.origin;
  } catch {
    throw new Error("The app's address (APP_URL) is not a web address.");
  }
  if (!APP_URL_LINE.test(source)) throw new Error("extension/config.js has no APP_URL line.");
  // JSON.stringify: the address goes in as a quoted string, whatever it contains.
  return source.replace(APP_URL_LINE, () => `export const APP_URL = ${JSON.stringify(origin)};`);
}

/** The extension folder as a ZIP, set to follow the app at `appUrl`. */
// turbopackIgnore: the folder is added to the deployed server by outputFileTracingIncludes (next.config.ts),
// so the build must not follow these paths itself (it would take in the whole project).
export async function extensionZip(appUrl: string, dir = path.join(/* turbopackIgnore: true */ process.cwd(), "extension")): Promise<Uint8Array> {
  const files: ZipFile[] = [];
  for (const relative of await listFiles(dir)) {
    const data = await readFile(path.join(/* turbopackIgnore: true */ dir, ...relative.split("/")));
    const content = relative === "config.js" ? Buffer.from(configFor(data.toString("utf8"), appUrl), "utf8") : data;
    files.push({ path: `${EXTENSION_FOLDER}/${relative}`, data: new Uint8Array(content) });
  }
  if (!files.some((file) => file.path === `${EXTENSION_FOLDER}/manifest.json`)) throw new Error("The extension folder has no manifest.json.");
  return zipStore(files);
}
