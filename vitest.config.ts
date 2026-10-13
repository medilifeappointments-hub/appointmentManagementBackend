import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/support/globalSetup.ts"],
    setupFiles: ["test/support/setupEnv.ts"],
    // Integration tests share one database and truncate it between tests.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
