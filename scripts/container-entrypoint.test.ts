import { describe, expect, it } from "vitest";

import {
  normalizeContainerMode,
  resolveContainerLaunch,
} from "./container-entrypoint.mjs";

describe("container entrypoint mode selection", () => {
  it("defaults to the standard agent runtime", () => {
    expect(normalizeContainerMode(undefined, {})).toBe("agent");
  });

  it("honors an explicit cloud mode override", () => {
    const launch = resolveContainerLaunch({
      MILADY_CONTAINER_MODE: "cloud-agent",
      MILADY_PORT: "4318",
    });

    expect(launch.mode).toBe("cloud-agent");
    expect(launch.args).toEqual([
      "--import",
      "./node_modules/tsx/dist/loader.mjs",
      "deploy/cloud-agent-entrypoint.ts",
    ]);
    expect(launch.env.PORT).toBe("4318");
    expect(launch.env.BRIDGE_PORT).toBe("18790");
  });

  it("detects bridge-only environments as cloud launches", () => {
    const launch = resolveContainerLaunch({
      MILADY_BRIDGE_PORT: "28790",
      BRIDGE_SECRET: "secret",
    });

    expect(launch.mode).toBe("cloud-agent");
    expect(launch.env.BRIDGE_PORT).toBe("28790");
  });

  it("lets explicit agent mode win over bridge-related env", () => {
    const launch = resolveContainerLaunch({
      MILADY_CONTAINER_MODE: "agent",
      BRIDGE_SECRET: "secret",
      MILADY_BRIDGE_PORT: "28790",
    });

    expect(launch.mode).toBe("agent");
    expect(launch.args).toEqual([
      "--import",
      "./node_modules/tsx/dist/loader.mjs",
      "milady.mjs",
      "start",
    ]);
  });
});
