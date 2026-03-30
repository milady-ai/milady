import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 120_000,
    hookTimeout: 120_000,
    include: ["packages/app-core/test/app/**/*.real.e2e.test.ts"],
    exclude: ["dist/**", "**/node_modules/**"],
  },
});
