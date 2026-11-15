import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@test": fileURLToPath(new URL("./test", import.meta.url)),
      // The "server-only" marker throws outside the Next.js server. Tests run plain Node, so use its empty file.
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "test/**/*.test.ts", "extension/**/*.test.js"],
    // The schema tests of the withdrawn shared lists (spec 34); see test/db/_closed/README.md.
    exclude: [...configDefaults.exclude, "test/db/_closed/**"],
    environment: "node",
    // Each test file starts its own in-process Postgres (about 1 GB of memory). Two at a time fits in 8 GB.
    maxWorkers: 2,
  },
});
