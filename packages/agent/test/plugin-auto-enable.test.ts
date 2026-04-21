import { describe, expect, test } from "vitest";
import { applyPluginAutoEnable } from "../src/config/plugin-auto-enable";

describe("applyPluginAutoEnable", () => {
  test("maps features.tts to plugin-edge-tts", () => {
    const { config } = applyPluginAutoEnable({
      config: { features: { tts: true } },
      env: {},
    });

    expect(config.plugins?.allow).toContain("edge-tts");
  });

  test("auto-enables edge-tts for cloud-provisioned containers", () => {
    const { config, changes } = applyPluginAutoEnable({
      config: {},
      env: {
        MILADY_CLOUD_PROVISIONED: "1",
        STEWARD_AGENT_TOKEN: "token",
      },
    });

    expect(config.plugins?.allow).toContain("edge-tts");
    expect(changes).toContain(
      "Auto-enabled plugin: @elizaos/plugin-edge-tts (cloud-provisioned voice output)",
    );
  });
});
