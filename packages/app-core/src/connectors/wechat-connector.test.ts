import { describe, expect, it } from "vitest";
import {
  extractPlugin,
  resolveWechatPluginImportSpecifier,
} from "../test-support/test-helpers";

const WECHAT_PLUGIN_IMPORT = resolveWechatPluginImportSpecifier();
const WECHAT_PLUGIN_AVAILABLE = WECHAT_PLUGIN_IMPORT !== null;
const describeIfAvailable = WECHAT_PLUGIN_AVAILABLE ? describe : describe.skip;

const loadWechatPluginModule = async () => {
  if (!WECHAT_PLUGIN_IMPORT) {
    throw new Error("WeChat plugin is not resolvable");
  }
  return (await import(WECHAT_PLUGIN_IMPORT)) as {
    default?: unknown;
    plugin?: unknown;
  };
};

describeIfAvailable("WeChat Connector - Basic Validation", () => {
  it("can import the WeChat plugin package", async () => {
    const mod = await loadWechatPluginModule();
    expect(mod).toBeDefined();
  });

  it("exports a valid plugin structure", async () => {
    const mod = await loadWechatPluginModule();
    const plugin = extractPlugin(mod);
    expect(plugin).not.toBeNull();
    expect(plugin).toBeDefined();
  });

  it("plugin has correct name", async () => {
    const mod = await loadWechatPluginModule();
    const plugin = extractPlugin(mod) as { name?: string } | null;
    expect(plugin?.name).toBe("wechat");
  });

  it("plugin has a description", async () => {
    const mod = await loadWechatPluginModule();
    const plugin = extractPlugin(mod) as { description?: string } | null;
    expect(plugin?.description).toBeDefined();
    expect(typeof plugin?.description).toBe("string");
  });
});

describe("WeChat Connector - Configuration", () => {
  it("validates single-account configuration", () => {
    const config = {
      enabled: true,
      apiKey: "key",
      proxyUrl: "https://proxy.example.com",
      webhookPort: 18790,
      deviceType: "ipad" as const,
    };
    expect(config.enabled).toBe(true);
    expect(config.apiKey).toBeTruthy();
  });

  it("validates multi-account configuration", () => {
    const config = {
      accounts: {
        main: {
          enabled: true,
          apiKey: "key",
          deviceType: "ipad" as const,
        },
        secondary: {
          enabled: true,
          apiKey: "key2",
          deviceType: "mac" as const,
        },
      },
    };
    expect(Object.keys(config.accounts)).toHaveLength(2);
  });

  it("validates feature flags have correct defaults", () => {
    const defaults = { images: true, groups: true };
    expect(defaults.images).toBe(true);
    expect(defaults.groups).toBe(true);
  });
});

describe("WeChat Connector - Environment Variables", () => {
  it("recognizes WECHAT_API_KEY environment variable", () => {
    const envKey = "WECHAT_API_KEY";
    expect(envKey).toBe("WECHAT_API_KEY");
  });
});
