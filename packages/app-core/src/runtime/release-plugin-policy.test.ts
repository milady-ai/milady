import {
  classifyRegistryPluginRelease,
  getBundledRuntimePackages,
} from "@miladyai/agent/runtime/release-plugin-policy";
import { describe, expect, it } from "vitest";

describe("release-plugin-policy", () => {
  it("returns the curated baseline runtime bundle", () => {
    const bundled = getBundledRuntimePackages([
      "@elizaos/core",
      "@elizaos/plugin-agent-orchestrator",
      "@elizaos/plugin-openai",
      "@elizaos/plugin-bnb-identity",
      "@elizaos/plugin-streaming-base",
      "@elizaos/prompts",
    ]);

    expect(bundled).toEqual([
      "@elizaos/core",
      "@elizaos/plugin-agent-orchestrator",
      "@elizaos/plugin-openai",
      "@elizaos/prompts",
    ]);
  });

  it("includes optional core plugins when the runtime ships them", () => {
    const bundled = getBundledRuntimePackages([
      "@elizaos/core",
      "@elizaos/prompts",
      "@miladyai/plugin-selfcontrol",
    ]);

    expect(bundled).toEqual([
      "@elizaos/core",
      "@elizaos/prompts",
      "@miladyai/plugin-selfcontrol",
    ]);
  });

  it("marks excluded registry plugins as post-release runtime installs", () => {
    const compatibility = classifyRegistryPluginRelease({
      packageName: "@elizaos/plugin-bnb-identity",
      bundledPluginIds: new Set(["sql", "openai"]),
    });

    expect(compatibility).toMatchObject({
      releaseAvailability: "post-release",
      installSurface: "runtime",
      postReleaseInstallable: true,
      requiresDesktopRuntime: false,
      requiresLocalRuntime: false,
    });
  });

  it("marks desktop-native runtime plugins with stronger install requirements", () => {
    const compatibility = classifyRegistryPluginRelease({
      packageName: "@elizaos/plugin-browser",
      bundledPluginIds: new Set(["sql", "openai"]),
    });

    expect(compatibility).toMatchObject({
      releaseAvailability: "post-release",
      installSurface: "runtime",
      postReleaseInstallable: true,
      requiresDesktopRuntime: true,
      requiresLocalRuntime: true,
    });
  });

  it("marks launchable apps as app-catalog installs instead of runtime plugins", () => {
    const compatibility = classifyRegistryPluginRelease({
      packageName: "@hyperscape/plugin-hyperscape",
      bundledPluginIds: new Set(["sql", "openai"]),
      kind: "app",
    });

    expect(compatibility).toMatchObject({
      releaseAvailability: "post-release",
      installSurface: "app",
      postReleaseInstallable: false,
    });
  });
});
