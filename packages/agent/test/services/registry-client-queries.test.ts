import { describe, expect, it } from "vitest";
import {
  getPluginInfoFromRegistry,
  normalizePluginLookupAlias,
} from "../../src/services/registry-client-queries";
import type { RegistryPluginInfo } from "../../src/services/plugin-manager-types";

const HYPERSCAPE_APP_INFO: RegistryPluginInfo = {
  name: "@hyperscape/plugin-hyperscape",
  gitRepo: "HyperscapeAI/hyperscape",
  gitUrl: "https://github.com/HyperscapeAI/hyperscape",
  description: "Hyperscape live session bridge",
  homepage: "https://hyperscape.gg",
  topics: ["game"],
  stars: 0,
  language: "TypeScript",
  kind: "app",
  npm: {
    package: "@hyperscape/plugin-hyperscape",
    v0Version: null,
    v1Version: null,
    v2Version: "1.0.0",
  },
  git: {
    v0Branch: null,
    v1Branch: null,
    v2Branch: "main",
  },
  supports: {
    v0: false,
    v1: false,
    v2: true,
  },
};

const HYPERSCAPE_PLUGIN_APP_INFO: RegistryPluginInfo = {
  ...HYPERSCAPE_APP_INFO,
  name: "@hyperscape/plugin-hyperscape",
  gitRepo: "hyperscape/plugin-hyperscape",
  gitUrl: "https://github.com/hyperscape/plugin-hyperscape",
  npm: {
    package: "@hyperscape/plugin-hyperscape",
    v0Version: null,
    v1Version: null,
    v2Version: "1.0.0",
  },
  appMeta: {
    displayName: "Hyperscape",
    category: "game",
    launchType: "connect",
    launchUrl: "https://hyperscape.gg",
    icon: null,
    capabilities: [],
    minPlayers: null,
    maxPlayers: null,
  },
};

describe("registry-client app lookup aliases", () => {
  it("keeps existing plugin alias normalization intact", () => {
    expect(normalizePluginLookupAlias("obsidan")).toBe("obsidian");
    expect(normalizePluginLookupAlias("plugin-obsidan")).toBe(
      "plugin-obsidian",
    );
  });

  it("resolves bare app slugs to @elizaos/app-* packages", () => {
    const registry = new Map<string, RegistryPluginInfo>([
      [HYPERSCAPE_APP_INFO.name, HYPERSCAPE_APP_INFO],
    ]);

    expect(getPluginInfoFromRegistry(registry, "hyperscape")).toEqual(
      HYPERSCAPE_APP_INFO,
    );
  });

  it("resolves bare app slugs to plugin-backed app packages", () => {
    const registry = new Map<string, RegistryPluginInfo>([
      [HYPERSCAPE_PLUGIN_APP_INFO.name, HYPERSCAPE_PLUGIN_APP_INFO],
    ]);

    expect(getPluginInfoFromRegistry(registry, "hyperscape")).toEqual(
      HYPERSCAPE_PLUGIN_APP_INFO,
    );
  });
});
