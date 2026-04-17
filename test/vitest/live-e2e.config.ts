import { defineConfig, mergeConfig } from "vitest/config";
import { liveAndRealE2EInclude } from "./e2e.config";
import baseConfig from "./real.config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: liveAndRealE2EInclude,
    },
  }),
);
