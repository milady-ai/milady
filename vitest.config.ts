import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(here, "apps", "app");
const optionalElizaAppStub = path.join(
  appRoot,
  "src",
  "optional-eliza-app-stub.tsx",
);
const nativePluginStub = path.join(appRoot, "src", "native-plugin-stubs.ts");
const appCoreBridgeStub = path.join(
  appRoot,
  "test",
  "stubs",
  "app-core-bridge.ts",
);

// Vite's import-analysis does not resolve glob patterns in package exports
// (e.g. "./*" -> "./dist/*.js"). Provide explicit aliases for subpaths that
// are structurally present but not enumerated in the package exports map.
const sharedDistCandidates = [
  path.join(here, "eliza/packages/shared/dist/connectors.js"),
  path.join(here, "node_modules/@elizaos/shared/dist/connectors.js"),
];
const sharedConnectorsDist =
  sharedDistCandidates.find((p) => fs.existsSync(p)) ??
  sharedDistCandidates[1];

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@elizaos/shared/connectors",
        replacement: sharedConnectorsDist,
      },
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
    setupFiles: [
      path.join(here, "apps", "homepage", "src", "__tests__", "setup.ts"),
      path.join(appRoot, "test", "setup.ts"),
    ],
    include: [
      "scripts/**/*.test.{ts,tsx,js,mjs}",
      "apps/app/test/**/*.test.{ts,tsx}",
      "apps/homepage/src/**/*.test.{ts,tsx}",
      "apps/homepage/src/**/__tests__/**/*.{ts,tsx}",
    ],
    exclude: [
      "node_modules/**",
      "dist/**",
      "eliza/**",
      "apps/app/test/**/*.e2e.*",
      "apps/app/test/ui-smoke/**",
      "apps/app/test/design-review/**",
      "apps/homepage/test/e2e/**",
    ],
  },
});
