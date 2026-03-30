import { defineConfig } from "vitest/config";
import baseConfig from "./vitest.e2e.config";

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: [
      "test/**/*.live.e2e.test.ts",
      "test/**/*.live.e2e.test.tsx",
      "test/**/*.real.e2e.test.ts",
      "test/**/*.real.e2e.test.tsx",
      "test/**/*-live.e2e.test.ts",
      "test/**/*-live.e2e.test.tsx",
      "packages/agent/test/**/*.live.e2e.test.ts",
      "packages/agent/test/**/*.live.e2e.test.tsx",
      "packages/agent/test/**/*.real.e2e.test.ts",
      "packages/agent/test/**/*.real.e2e.test.tsx",
      "packages/agent/test/**/*-live.e2e.test.ts",
      "packages/agent/test/**/*-live.e2e.test.tsx",
      // Cloud provider coverage lives in a mixed E2E spec with gated live cases.
      "packages/agent/test/cloud-providers.e2e.test.ts",
      "packages/app-core/test/**/*.live.e2e.test.ts",
      "packages/app-core/test/**/*.live.e2e.test.tsx",
      "packages/app-core/test/**/*.real.e2e.test.ts",
      "packages/app-core/test/**/*.real.e2e.test.tsx",
      "packages/app-core/test/**/*-live.e2e.test.ts",
      "packages/app-core/test/**/*-live.e2e.test.tsx",
    ],
    exclude: ["dist/**", "**/node_modules/**"],
  },
});
