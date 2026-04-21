import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: "forks",
    include: [
      "test/**/*.test.ts",
      "src/**/*.test.ts",
    ],
    exclude: [
      "dist/**",
      "**/node_modules/**",
      "test/**/*.e2e.test.ts",
    ],
    server: {
      deps: {
        inline: ["@elizaos/core", "zod"],
      },
    },
  },
});
