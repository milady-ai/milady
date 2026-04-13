import { describe, expect, it } from "vitest";

import {
  resolveCloudApiKey,
  resolveCloudConnectionSnapshot,
} from "./cloud-connection";

describe("cloud-connection", () => {
  const cloudInferenceConfig = {
    serviceRouting: {
      llmText: {
        transport: "cloud-proxy" as const,
        backend: "elizacloud",
      },
    },
  };

  it("resolves the cloud api key from runtime settings", () => {
    const runtime = {
      getSetting: (key: string) =>
        key === "ELIZAOS_CLOUD_API_KEY" ? "runtime-setting-key" : undefined,
    };

    expect(resolveCloudApiKey(cloudInferenceConfig, runtime)).toBe(
      "runtime-setting-key",
    );
  });

  it("marks hasApiKey when the runtime exposes a saved cloud api key", () => {
    const runtime = {
      getSetting: (key: string) =>
        key === "ELIZAOS_CLOUD_API_KEY" ? "runtime-setting-key" : undefined,
      getService: () => null,
    };

    expect(
      resolveCloudConnectionSnapshot(cloudInferenceConfig, runtime as never),
    ).toMatchObject({
      connected: true,
      hasApiKey: true,
      authConnected: false,
    });
  });
});
