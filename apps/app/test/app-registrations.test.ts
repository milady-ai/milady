import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import appConfig from "../app.config";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");

/**
 * Contract tests for app registration wiring.
 *
 * Milady defaults to a decoupled shell that can install from published elizaOS
 * packages without a local eliza checkout. Optional apps may be registered by
 * installing their package and adding them to app.config.ts.
 */
describe("app registration contracts", () => {
  it("does not require unpublished elizaOS app packages by default", () => {
    expect(appConfig.defaultApps).toEqual([]);
  });

  it("unpublished optional apps resolve to local stubs instead of eliza source", () => {
    const tsconfig = JSON.parse(
      fs.readFileSync(path.join(appRoot, "tsconfig.json"), "utf8"),
    );
    const paths: Record<string, string[]> =
      tsconfig?.compilerOptions?.paths ?? {};
    expect(paths["@elizaos/app-workflow-builder"]).toEqual([
      "./apps/app/src/optional-eliza-app-stub.tsx",
    ]);
    expect(paths["@elizaos/app-workflow-builder/*"]).toEqual([
      "./apps/app/src/optional-eliza-app-stub.tsx",
    ]);
  });

  it("does not inject unpublished route modules into the vite build", () => {
    const viteConfigText = fs.readFileSync(
      path.join(appRoot, "vite.config.ts"),
      "utf8",
    );
    expect(viteConfigText).toContain(
      "const DEFAULT_APP_ROUTE_PLUGIN_MODULES: string[] = [];",
    );
  });

  it("all defaultApps have corresponding tsconfig path aliases", () => {
    const tsconfig = JSON.parse(
      fs.readFileSync(path.join(appRoot, "tsconfig.json"), "utf8"),
    );
    const paths: Record<string, string[]> =
      tsconfig?.compilerOptions?.paths ?? {};

    for (const appPkg of appConfig.defaultApps) {
      expect(
        paths[appPkg],
        `${appPkg} missing from tsconfig paths`,
      ).toBeDefined();
      expect(
        paths[`${appPkg}/*`],
        `${appPkg}/* missing from tsconfig paths`,
      ).toBeDefined();
    }
  });
});
