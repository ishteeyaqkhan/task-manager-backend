import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: parse(readFileSync(".env.test")),
    // Test files share one database, so run them one at a time.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
