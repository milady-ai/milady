import { describe, expect, it } from "vitest";

import { applyPluginAutoEnable } from "../src/config/plugin-auto-enable";

describe("applyPluginAutoEnable — plugin-evm", () => {
  it("auto-enables plugin-evm when a local EVM key is present", () => {
    const { config, changes } = applyPluginAutoEnable({
      config: {},
      env: {
        EVM_PRIVATE_KEY:
          "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      },
    });

    expect(config.plugins?.allow).toContain("evm");
    expect(changes.some((change) => change.includes("plugin-evm"))).toBe(true);
  });

  it("auto-enables plugin-evm for cloud-provisioned Steward wallets", () => {
    const { config, changes } = applyPluginAutoEnable({
      config: {},
      env: {
        MILADY_CLOUD_PROVISIONED: "1",
        STEWARD_AGENT_TOKEN: "steward-token",
      },
    });

    expect(config.plugins?.allow).toContain("evm");
    expect(
      changes.some((change) =>
        change.includes("cloud-provisioned Steward wallet"),
      ),
    ).toBe(true);
  });

  it("respects explicit plugin disablement", () => {
    const { config, changes } = applyPluginAutoEnable({
      config: {
        plugins: {
          entries: {
            evm: { enabled: false },
          },
        },
      },
      env: {
        MILADY_CLOUD_PROVISIONED: "1",
        STEWARD_AGENT_TOKEN: "steward-token",
      },
    });

    expect(config.plugins?.allow ?? []).not.toContain("evm");
    expect(changes.some((change) => change.includes("plugin-evm"))).toBe(false);
  });
});
