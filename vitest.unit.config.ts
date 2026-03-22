import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      // Keep unit coverage focused on colocated source tests plus shared
      // helpers. The higher-level app harness suites under packages/app-core
      // test/app run as targeted renderer/startup flows instead of unit jobs.
      coverage: {
        excludeAfterRemap: true,
        include: [
          "packages/**/src/**/*.ts",
          "apps/**/src/**/*.ts",
          "scripts/**/*.ts",
          "test/**/*.ts",
        ],
        exclude: [
          "**/*.test.ts",
          "**/*.test.tsx",
          "**/*.live.test.ts",
          "**/*.e2e.test.ts",
          "**/*.e2e.test.tsx",
          "dist/**",
          "**/node_modules/**",
          "packages/app-core/src/**/*.tsx",
          "packages/app-core/src/i18n/**",
          "packages/app-core/src/platform/**",
          "packages/app-core/test/app/**",
        ],
      },
      exclude: [
        "dist/**",
        "**/node_modules/**",
        "**/*.live.test.ts",
        "**/*.e2e.test.ts",
        "**/*.e2e.test.tsx",
        "packages/app-core/test/app/**",
      ],
    },
  }),
);
