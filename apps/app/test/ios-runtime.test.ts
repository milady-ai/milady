import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type RuntimeEnv = Record<string, string | undefined>;
type IosRuntimeModule = {
  DEFAULT_ELIZA_CLOUD_BASE: string;
  resolveCloudApiBase(env: RuntimeEnv): string;
  apiBaseToDeviceBridgeUrl(apiBase: string): string;
  resolveIosRuntimeConfig(env: RuntimeEnv): unknown;
};

const require = createRequire(import.meta.url);
const appCoreRoot = path.dirname(
  require.resolve("@elizaos/app-core/package.json"),
);
const iosRuntimePath = [
  path.join(appCoreRoot, "src/platform/ios-runtime.js"),
  path.join(appCoreRoot, "src/platform/ios-runtime.ts"),
  path.join(appCoreRoot, "packages/app-core/src/platform/ios-runtime.js"),
  path.join(appCoreRoot, "packages/app-core/src/platform/ios-runtime.ts"),
].find((candidate) => fs.existsSync(candidate));

if (!iosRuntimePath) {
  throw new Error(`Unable to resolve app-core iOS runtime from ${appCoreRoot}`);
}

const iosRuntimeModule = (await import(
  pathToFileURL(iosRuntimePath).href
)) as IosRuntimeModule;

const {
  apiBaseToDeviceBridgeUrl,
  DEFAULT_ELIZA_CLOUD_BASE,
  resolveCloudApiBase,
  resolveIosRuntimeConfig,
} = iosRuntimeModule;

describe("iOS runtime config", () => {
  it("defaults to cloud mode on the canonical Eliza Cloud base", () => {
    expect(resolveIosRuntimeConfig({})).toEqual({
      mode: "cloud",
      cloudApiBase: DEFAULT_ELIZA_CLOUD_BASE,
    });
  });

  it("prefers the canonical Eliza Cloud env var over legacy cloud aliases", () => {
    expect(
      resolveCloudApiBase({
        VITE_CLOUD_BASE: "https://legacy.example.test",
        VITE_ELIZA_CLOUD_BASE: "https://cloud.example.test/",
      }),
    ).toBe("https://cloud.example.test");
  });

  it("normalizes remote Mac API configuration", () => {
    expect(
      resolveIosRuntimeConfig({
        VITE_MILADY_IOS_RUNTIME_MODE: "remote-mac",
        VITE_MILADY_IOS_API_BASE: "http://192.168.1.42:31337/",
        VITE_MILADY_IOS_API_TOKEN: " dev-token ",
      }),
    ).toMatchObject({
      mode: "remote-mac",
      apiBase: "http://192.168.1.42:31337",
      apiToken: "dev-token",
    });
  });

  it("derives the device bridge URL from the configured API base in hybrid mode", () => {
    expect(
      resolveIosRuntimeConfig({
        VITE_MILADY_IOS_RUNTIME_MODE: "cloud-hybrid",
        VITE_MILADY_IOS_API_BASE: "https://agent.example.test/",
      }).deviceBridgeUrl,
    ).toBe("wss://agent.example.test/api/local-inference/device-bridge");
  });

  it("keeps an explicit device bridge URL instead of deriving one", () => {
    expect(
      resolveIosRuntimeConfig({
        VITE_MILADY_IOS_RUNTIME_MODE: "cloud-hybrid",
        VITE_MILADY_IOS_API_BASE: "https://agent.example.test",
        VITE_MILADY_DEVICE_BRIDGE_URL: "wss://bridge.example.test/ws",
      }).deviceBridgeUrl,
    ).toBe("wss://bridge.example.test/ws");
  });

  it("maps HTTP API bases to WebSocket device bridge URLs", () => {
    expect(apiBaseToDeviceBridgeUrl("http://10.0.0.12:31337")).toBe(
      "ws://10.0.0.12:31337/api/local-inference/device-bridge",
    );
  });
});
