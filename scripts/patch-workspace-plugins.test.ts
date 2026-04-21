import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PLUGIN_PATCH_DIRS,
  resolvePluginDir,
} from "./patch-workspace-plugins.mjs";

describe("PLUGIN_PATCH_DIRS", () => {
  it("maps all expected plugin names to their submodule paths", () => {
    expect(PLUGIN_PATCH_DIRS["plugin-anthropic"]).toBe(
      "plugins/plugin-anthropic",
    );
    expect(PLUGIN_PATCH_DIRS["plugin-google-genai"]).toBe(
      "plugins/plugin-google-genai",
    );
    expect(PLUGIN_PATCH_DIRS["plugin-personality"]).toBe(
      "plugins/plugin-personality",
    );
    expect(PLUGIN_PATCH_DIRS["plugin-agent-skills"]).toBe(
      "plugins/plugin-agent-skills",
    );
  });
});

describe("resolvePluginDir", () => {
  const root = path.resolve(process.cwd(), "test-repo-root");

  it("resolves patch filenames to the correct plugin submodule directory", () => {
    expect(
      resolvePluginDir("plugin-anthropic-elizaos-core-api-compat.patch", {
        rootDir: root,
      }),
    ).toBe(path.join(root, "plugins", "plugin-anthropic"));

    expect(
      resolvePluginDir("plugin-google-genai-elizaos-core-api-compat.patch", {
        rootDir: root,
      }),
    ).toBe(path.join(root, "plugins", "plugin-google-genai"));

    expect(
      resolvePluginDir("plugin-personality-elizaos-core-api-compat.patch", {
        rootDir: root,
      }),
    ).toBe(path.join(root, "plugins", "plugin-personality"));

    expect(
      resolvePluginDir("plugin-agent-skills-crlf-fix.patch", {
        rootDir: root,
      }),
    ).toBe(path.join(root, "plugins", "plugin-agent-skills"));
  });

  it("returns null for patch files with no matching prefix", () => {
    expect(
      resolvePluginDir("plugin-unknown-some-fix.patch", { rootDir: root }),
    ).toBeNull();

    expect(
      resolvePluginDir("not-a-plugin-patch.patch", { rootDir: root }),
    ).toBeNull();
  });

  it("does not match partial prefix without trailing hyphen", () => {
    // 'plugin-anthropicXYZ.patch' should not resolve to plugin-anthropic
    expect(
      resolvePluginDir("plugin-anthropicXYZ.patch", { rootDir: root }),
    ).toBeNull();
  });
});
