// Runs only the preview tool (not part of `npm test`). See previews.test.tsx.
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../../src", import.meta.url)),
      "@test": fileURLToPath(new URL("../../test", import.meta.url)),
      "server-only": fileURLToPath(new URL("../../node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  root: fileURLToPath(new URL("../..", import.meta.url)),
  test: { include: ["scripts/preview/previews.test.tsx"], environment: "node" },
});
