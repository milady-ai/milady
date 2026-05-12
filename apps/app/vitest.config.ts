import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));
const optionalElizaAppStub = path.join(
  here,
  "src",
  "optional-eliza-app-stub.tsx",
);
const nativePluginStub = path.join(here, "src", "native-plugin-stubs.ts");
const appCoreBridgeStub = path.join(
  here,
  "test",
  "stubs",
  "app-core-bridge.ts",
);

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@elizaos\/app-(?!core$|core\/|hyperscape$|hyperscape\/)(.*)/,
        replacement: optionalElizaAppStub,
      },
      {
        find: /^@clawville\/app-clawville(?:\/.*)?$/,
        replacement: optionalElizaAppStub,
      },
      {
        find: /^@elizaos\/capacitor-(.*)/,
        replacement: nativePluginStub,
      },
      {
        find: /^@elizaos\/app-core\/bridge(?:\/.*)?$/,
        replacement: appCoreBridgeStub,
      },
      {
        find: /^@elizaos\/app-core\/electrobun-(rpc|runtime)$/,
        replacement: appCoreBridgeStub,
      },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [path.join(here, "test", "setup.ts")],
    include: ["test/**/*.test.{ts,tsx}"],
    exclude: [
      "node_modules/**",
      "dist/**",
      "test/**/*.e2e.*",
      "test/ui-smoke/**",
      "test/design-review/**",
    ],
    server: {
      deps: {
        inline: [
          "@elizaos/agent",
          "@elizaos/app-core",
          "@elizaos/core",
          "@testing-library/react",
          "react",
          "react-dom",
          "react-test-renderer",
          /^@elizaos\/plugin-/,
          "zod",
        ],
      },
    },
  },
});
