import { describe, expect, it } from "vitest";
import {
  removeLocalElizaOverrideSpecifiers,
  rewriteConfiguredElizaRegistrySpecifiers,
} from "./disable-local-eliza-workspace.mjs";

describe("disable local eliza workspace", () => {
  it("rewrites exact elizaOS registry pins when an explicit package tag is selected", () => {
    const pkg = {
      dependencies: {
        "@elizaos/core": "workspace:*",
        "@elizaos/prompts": "2.0.0-alpha.139",
        leftpad: "1.0.0",
      },
      overrides: {
        "@elizaos/plugin-cli": "2.0.0-alpha.9",
      },
    };
    const registry = new Map([
      [
        "@elizaos/prompts",
        {
          "dist-tags": {
            beta: "2.0.0-beta.17",
          },
        },
      ],
      [
        "@elizaos/plugin-cli",
        {
          "dist-tags": {
            beta: "2.0.0-beta.4",
          },
        },
      ],
    ]);

    const changed = rewriteConfiguredElizaRegistrySpecifiers(pkg, {
      env: { MILADY_ELIZAOS_DIST_TAG: "beta" },
      readRegistryInfo: (name) => registry.get(name) ?? null,
      log: () => undefined,
      warn: () => undefined,
    });

    expect(changed).toBe(true);
    expect(pkg.dependencies["@elizaos/core"]).toBe("workspace:*");
    expect(pkg.dependencies["@elizaos/prompts"]).toBe("2.0.0-beta.17");
    expect(pkg.dependencies.leftpad).toBe("1.0.0");
    expect(pkg.overrides["@elizaos/plugin-cli"]).toBe("2.0.0-beta.4");
  });

  it("leaves exact elizaOS registry pins alone when no package tag is explicit", () => {
    const pkg = {
      dependencies: {
        "@elizaos/prompts": "2.0.0-alpha.139",
      },
    };

    const changed = rewriteConfiguredElizaRegistrySpecifiers(pkg, {
      env: {},
      log: () => undefined,
      warn: () => undefined,
    });

    expect(changed).toBe(false);
    expect(pkg.dependencies["@elizaos/prompts"]).toBe("2.0.0-alpha.139");
  });

  it("repairs stale local overrides back to package-mode registry overrides", () => {
    const pkg = {
      overrides: {
        "@elizaos/shared": "file:./eliza/packages/shared",
        "@elizaos/ui": "file:./eliza/packages/ui",
        "@elizaos/app-core": "file:./eliza/packages/app-core",
      },
    };

    const changed = removeLocalElizaOverrideSpecifiers(pkg, {
      log: () => undefined,
    });

    expect(changed).toBe(true);
    expect(pkg.overrides["@elizaos/shared"]).toBe("beta");
    expect(pkg.overrides["@elizaos/ui"]).toBe("beta");
    expect(pkg.overrides["@elizaos/app-core"]).toBeUndefined();
  });
});
