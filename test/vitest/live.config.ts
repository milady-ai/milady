import { defineConfig, mergeConfig } from "vitest/config";
import realConfig from "./real.config";

export default mergeConfig(
  realConfig,
  defineConfig({
    test: {
      include: [
        "eliza/packages/agent/test/**/*.live.test.ts",
        "eliza/packages/app-core/test/**/*.live.test.ts",
        "eliza/packages/app-core/test/**/*.live.e2e.test.ts",
        "eliza/packages/agent/test/**/*.live.test.ts",
        "eliza/packages/app-core/test/**/*.live.test.ts",
        "eliza/packages/app-core/test/**/*.live.e2e.test.ts",
      ],
      exclude: [
        "dist/**",
        "**/node_modules/**",
        "apps/app/electrobun/**",
        "apps/chrome-extension/**",
      ],
    },
  }),
);
