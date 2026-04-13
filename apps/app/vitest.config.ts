import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import {
  getAppCoreSourceRoot,
  getAutonomousSourceRoot,
} from "../../test/eliza-package-paths";

const here = path.dirname(fileURLToPath(import.meta.url));
const nativePluginsRoot = path.join(
  here,
  "../../eliza/packages/native-plugins",
);
const appCorePackageRoot = getAppCoreSourceRoot(here);
const agentSourceRoot = getAutonomousSourceRoot(here);

const bridgeStubPath = path.join(
  here,
  "..",
  "..",
  "test",
  "stubs",
  "app-core-bridge.ts",
);

/**
 * Custom Vite plugin that redirects @elizaos/app-core/bridge imports to
 * the test shim before Vite's built-in resolver tries to resolve through
 * the package's exports map (which may reference native bindings that are
 * unavailable in the test environment).
 */
function appCoreBridgeStubPlugin(): Plugin {
  return {
    name: "app-core-bridge-stub",
    enforce: "pre",
    resolveId(source) {
      if (
        source === "@elizaos/app-core/bridge/electrobun-rpc" ||
        source === "@elizaos/app-core/bridge/electrobun-runtime" ||
        source === "@elizaos/app-core/bridge"
      ) {
        return bridgeStubPath;
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [appCoreBridgeStubPlugin()],
  resolve: {
    alias: [
      {
        find: "react",
        replacement: path.join(here, "node_modules/react"),
      },
      {
        find: "react-dom",
        replacement: path.join(here, "node_modules/react-dom"),
      },
      ...(appCorePackageRoot
        ? (() => {
            const appCorePkgPath = path.resolve(
              appCorePackageRoot,
              "..",
              "package.json",
            );
            const appCorePkg = JSON.parse(
              fs.readFileSync(appCorePkgPath, "utf8"),
            );
            const generatedAliases = [];
            for (const [key, value] of Object.entries(
              appCorePkg.exports || {},
            )) {
              if (typeof value === "string") {
                const aliasKey =
                  key === "."
                    ? "@elizaos/app-core"
                    : `@elizaos/app-core/${key.replace(/^\.\//, "")}`;
                const targetPath = path.resolve(
                  appCorePackageRoot,
                  "..",
                  value,
                );

                generatedAliases.push({
                  find: new RegExp(`^${aliasKey}$`),
                  replacement: targetPath,
                });
                if (!aliasKey.endsWith(".js") && !aliasKey.endsWith(".css")) {
                  generatedAliases.push({
                    find: new RegExp(`^${aliasKey}\\.js$`),
                    replacement: targetPath,
                  });
                }
              }
            }
            // Catch-all: resolve any @elizaos/app-core sub-path imports
            // not explicitly listed in the exports map directly to the
            // source tree (e.g. components/Header → src/components/Header).
            generatedAliases.push({
              find: /^@miladyai\/app-core\/src\/(.*)/,
              replacement: path.join(appCorePackageRoot, "$1"),
            });
            generatedAliases.push({
              find: /^@miladyai\/app-core\/(.*)/,
              replacement: path.join(appCorePackageRoot, "$1"),
            });
            return generatedAliases;
          })()
        : []),
      // Resolve @elizaos/agent sub-path imports to the source tree
      ...(agentSourceRoot
        ? [
            {
              find: /^@elizaos\/agent\/(.*)/,
              replacement: path.join(agentSourceRoot, "$1"),
            },
          ]
        : []),
    ],
  },
  test: {
    // Use POSIX-style relative globs so test discovery works on Windows too.
    include: [
      "test/**/*.test.ts",
      "test/**/*.test.tsx",
      "../../eliza/packages/app-core/test/**/*.test.ts",
      "../../eliza/packages/app-core/test/**/*.test.tsx",
    ],
    // Live/real QA browser checks are opt-in and should not run as part of the
    // default app suite, even if the developer shell exports live-test env.
    exclude: [
      "../../eliza/packages/app-core/test/**/*.e2e.test.ts",
      "../../eliza/packages/app-core/test/**/*.e2e.test.tsx",
      "../../eliza/packages/app-core/test/**/*.live.e2e.test.ts",
      "../../eliza/packages/app-core/test/**/*.live.e2e.test.tsx",
      "../../eliza/packages/app-core/test/**/*.real.e2e.test.ts",
      "../../eliza/packages/app-core/test/**/*.real.e2e.test.tsx",
      "test/**/*-live.test.ts",
      "test/**/*-live.test.tsx",
      "test/**/*.live.test.ts",
      "test/**/*.live.test.tsx",
      "test/**/*-live.e2e.test.ts",
      "test/**/*-live.e2e.test.tsx",
      "test/**/*.live.e2e.test.ts",
      "test/**/*.live.e2e.test.tsx",
      "test/**/*.real.e2e.test.ts",
      "test/**/*.real.e2e.test.tsx",
      "../../eliza/packages/app-core/test/**/*-live.test.ts",
      "../../eliza/packages/app-core/test/**/*-live.test.tsx",
      "../../eliza/packages/app-core/test/**/*.live.test.ts",
      "../../eliza/packages/app-core/test/**/*.live.test.tsx",
      "../../eliza/packages/app-core/test/**/*-live.e2e.test.ts",
      "../../eliza/packages/app-core/test/**/*-live.e2e.test.tsx",
      "../../eliza/packages/app-core/test/**/*.live.e2e.test.ts",
      "../../eliza/packages/app-core/test/**/*.live.e2e.test.tsx",
      "../../eliza/packages/app-core/test/**/*.real.e2e.test.ts",
      "../../eliza/packages/app-core/test/**/*.real.e2e.test.tsx",
    ],
    setupFiles: [path.join(here, "test/setup.ts")],
    environment: "node",
    alias: {
      "@elizaos/skills": path.join(
        here,
        "test",
        "doubles",
        "elizaos-skills.ts",
      ),
      "@elizaos/capacitor-gateway": path.join(
        nativePluginsRoot,
        "gateway/src/index.ts",
      ),
      "@elizaos/capacitor-swabble": path.join(
        nativePluginsRoot,
        "swabble/src/index.ts",
      ),
      "@elizaos/capacitor-talkmode": path.join(
        nativePluginsRoot,
        "talkmode/src/index.ts",
      ),
      "@elizaos/capacitor-camera": path.join(
        nativePluginsRoot,
        "camera/src/index.ts",
      ),
      "@elizaos/capacitor-location": path.join(
        nativePluginsRoot,
        "location/src/index.ts",
      ),
      "@elizaos/capacitor-screencapture": path.join(
        nativePluginsRoot,
        "screencapture/src/index.ts",
      ),
      "@elizaos/capacitor-canvas": path.join(
        nativePluginsRoot,
        "canvas/src/index.ts",
      ),
      "@elizaos/capacitor-desktop": path.join(
        nativePluginsRoot,
        "desktop/src/index.ts",
      ),
      "@elizaos/capacitor-agent": path.join(
        nativePluginsRoot,
        "agent/src/index.ts",
      ),
      "@elizaos/capacitor-websiteblocker": path.join(
        nativePluginsRoot,
        "websiteblocker/src/index.ts",
      ),
    },
    testTimeout: 30000,
    globals: true,
    server: {
      deps: {
        inline: ["@elizaos/app-core"],
      },
    },
  },
});
