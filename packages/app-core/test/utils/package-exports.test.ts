import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression test: ensures every subpath used by internal imports
 * has a matching entry in the package.json "exports" map.
 *
 * This prevents Vite / Node resolution errors like:
 *   Missing "./utils/eliza-globals" specifier in "@miladyai/app-core" package
 */
describe("@miladyai/app-core package exports", () => {
  const pkgPath = resolve(__dirname, "../../package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const exportKeys = Object.keys(pkg.exports ?? {});

  /**
   * Subpaths that are imported with deep paths within the package
   * or by downstream consumers (e.g. @elizaos/home).
   * Each entry should resolve through the exports map.
   */
  const requiredSubpaths = [
    "./api",
    "./bridge",
    "./config",
    "./events",
    "./hooks",
    "./i18n",
    "./navigation",
    "./platform",
    "./state",
    "./types",
    "./utils",
    "./voice",
    "./autonomy",
    "./chat",
    "./coding",
    "./providers",
    "./actions",
    "./services/steward-sidecar",
    "./onboarding-config",
    "./companion",
    "./components",
    "./styles/base.css",
    "./styles/xterm.css",
    "./styles/styles.css",
  ];

  for (const subpath of requiredSubpaths) {
    it(`exports "${subpath}"`, () => {
      expect(exportKeys).toContain(subpath);
    });
  }
});
