import { defineConfig, mergeConfig } from "vitest/config";
import realConfig from "./real.config";

export default mergeConfig(
  realConfig,
  defineConfig({
    test: {
      include: ["eliza/packages/app-core/test/app/**/*.real.e2e.test.ts"],
      exclude: ["dist/**", "**/node_modules/**"],
    },
  }),
);
