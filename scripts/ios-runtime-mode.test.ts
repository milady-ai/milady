import { describe, expect, it } from "vitest";
import {
  apiBaseToDeviceBridgeUrl,
  buildModeEnv,
  DEFAULT_ELIZA_CLOUD_BASE,
  resolveLanHost,
} from "./ios-runtime-mode.mjs";

describe("ios-runtime-mode", () => {
  it("resolves a non-internal IPv4 address for remote Mac builds", () => {
    expect(
      resolveLanHost({
        lo0: [{ family: "IPv4", internal: true, address: "127.0.0.1" }],
        en0: [{ family: "IPv4", internal: false, address: "192.168.50.10" }],
      }),
    ).toBe("192.168.50.10");
  });

  it("builds remote Mac Vite env from explicit API settings", () => {
    expect(
      buildModeEnv("remote-mac", {
        env: {
          MILADY_IOS_REMOTE_API_BASE: "http://192.168.50.10:31337/",
          MILADY_IOS_REMOTE_API_TOKEN: "phone-token",
        },
        networkInterfaces: {},
      }),
    ).toMatchObject({
      VITE_MILADY_IOS_RUNTIME_MODE: "remote-mac",
      VITE_MILADY_IOS_API_BASE: "http://192.168.50.10:31337",
      VITE_MILADY_IOS_API_TOKEN: "phone-token",
    });
  });

  it("defaults cloud builds to Eliza Cloud", () => {
    expect(buildModeEnv("cloud", { env: {}, networkInterfaces: {} })).toEqual({
      VITE_MILADY_IOS_RUNTIME_MODE: "cloud",
      VITE_ELIZA_CLOUD_BASE: DEFAULT_ELIZA_CLOUD_BASE,
    });
  });

  it("builds cloud-hybrid env without forcing the main API away from cloud", () => {
    expect(
      buildModeEnv("cloud-hybrid", {
        env: {
          MILADY_IOS_DEVICE_BRIDGE_API_BASE: "https://agent.example.test/",
          ELIZA_DEVICE_PAIRING_TOKEN: "pairing-token",
        },
        networkInterfaces: {},
      }),
    ).toEqual({
      VITE_MILADY_IOS_RUNTIME_MODE: "cloud-hybrid",
      VITE_ELIZA_CLOUD_BASE: DEFAULT_ELIZA_CLOUD_BASE,
      VITE_MILADY_DEVICE_BRIDGE_URL:
        "wss://agent.example.test/api/local-inference/device-bridge",
      VITE_MILADY_DEVICE_BRIDGE_TOKEN: "pairing-token",
    });
  });

  it("converts API bases into device bridge URLs", () => {
    expect(apiBaseToDeviceBridgeUrl("https://agent.example.test/api")).toBe(
      "wss://agent.example.test/api/local-inference/device-bridge",
    );
  });
});
