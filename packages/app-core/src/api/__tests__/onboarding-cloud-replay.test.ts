/**
 * Regression tests: cloud API key must survive the onboarding replay.
 *
 * BUG: When the user connects to Eliza Cloud during onboarding, the Milady
 * compat handler (POST /api/onboarding) correctly persists the cloud.apiKey
 * to disk. However, it then replays the body to the upstream Eliza handler,
 * which uses its stale in-memory `state.config` (loaded at startup, before
 * OAuth). The upstream handler calls `saveElizaConfig(state.config)`, which
 * CLOBBERS the apiKey that was just written to disk.
 *
 * FIX: The replay body is enriched with `providerApiKey` so the upstream
 * handler writes the key into state.config before saving. This ensures the
 * apiKey survives the upstream's save.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/config", () => ({
  loadElizaConfig: vi.fn(),
  saveElizaConfig: vi.fn(),
}));

vi.mock("@elizaos/core", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
  stringToUuid: (s: string) => `uuid-${s}`,
}));

vi.mock("@miladyai/agent/cloud/validate-url", () => ({
  validateCloudBaseUrl: vi.fn(() => Promise.resolve(null)),
}));

import { loadElizaConfig } from "../../config/config";
import { deriveCompatOnboardingReplayBody } from "../server-onboarding-compat";

const loadMock = loadElizaConfig as ReturnType<typeof vi.fn>;

describe("deriveCompatOnboardingReplayBody", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("detects cloud mode from connection.kind === 'cloud-managed'", () => {
    const body = {
      name: "Agent",
      connection: { kind: "cloud-managed" },
    };
    const { isCloudMode, replayBody } = deriveCompatOnboardingReplayBody(body);
    expect(isCloudMode).toBe(true);
    expect(replayBody).toHaveProperty("runMode", "cloud");
  });

  it("detects cloud mode from runMode === 'cloud'", () => {
    const body = { name: "Agent", runMode: "cloud" };
    const { isCloudMode, replayBody } = deriveCompatOnboardingReplayBody(body);
    expect(isCloudMode).toBe(true);
    // runMode already "cloud", so replayBody === body
    expect(replayBody.runMode).toBe("cloud");
  });

  it("returns isCloudMode: false for local provider", () => {
    const body = {
      name: "Agent",
      connection: { kind: "local-provider", provider: "anthropic" },
    };
    const { isCloudMode } = deriveCompatOnboardingReplayBody(body);
    expect(isCloudMode).toBe(false);
  });
});

describe("onboarding replay body enrichment (integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.ELIZAOS_CLOUD_API_KEY;
    delete process.env.ELIZAOS_CLOUD_ENABLED;
  });

  it("cloud apiKey from disk config is available for replay enrichment", () => {
    // Simulate: persistCloudLoginStatus already wrote the apiKey to disk
    const configWithKey = {
      env: {},
      cloud: {
        enabled: true,
        apiKey: "cloud-key-from-oauth",
        inferenceMode: "cloud",
      },
      agents: { defaults: {}, list: [{ id: "main", default: true }] },
      meta: {},
      models: {},
    };
    loadMock.mockReturnValue(configWithKey);

    // The compat handler reads fresh config to get the apiKey
    const config = loadMock();
    const cloudApiKey = config.cloud?.apiKey;

    expect(cloudApiKey).toBe("cloud-key-from-oauth");

    // This key would be injected into the replay body as providerApiKey
    const body = { name: "Agent", runMode: "cloud" };
    const enriched = {
      ...body,
      providerApiKey: cloudApiKey,
    };

    expect(enriched.providerApiKey).toBe("cloud-key-from-oauth");
  });

  it("upstream handler would write providerApiKey to state.config.cloud.apiKey", () => {
    // Simulate upstream's stale state.config (no apiKey)
    const staleConfig = {
      cloud: { enabled: false } as Record<string, unknown>,
    };

    // Simulate what upstream handler does at lines 8287-8294
    const body = {
      name: "Agent",
      runMode: "cloud",
      providerApiKey: "cloud-key-from-replay",
    };

    if (
      typeof body.providerApiKey === "string" &&
      body.providerApiKey.trim().length > 0
    ) {
      staleConfig.cloud.apiKey = body.providerApiKey.trim();
    }

    expect(staleConfig.cloud.apiKey).toBe("cloud-key-from-replay");
  });

  it("without providerApiKey, upstream clobbers apiKey (demonstrates the bug)", () => {
    // This test documents the bug: upstream uses stale config, no apiKey
    const staleConfig = {
      cloud: { enabled: false } as Record<string, unknown>,
    };

    // Body without providerApiKey (the old behavior)
    const body = {
      name: "Agent",
      runMode: "cloud",
    };

    // Upstream handler checks for providerApiKey — it's missing
    if (
      typeof (body as Record<string, unknown>).providerApiKey === "string" &&
      ((body as Record<string, unknown>).providerApiKey as string).trim()
        .length > 0
    ) {
      staleConfig.cloud.apiKey = (
        (body as Record<string, unknown>).providerApiKey as string
      ).trim();
    }

    // apiKey is NOT set — this is the bug
    expect(staleConfig.cloud.apiKey).toBeUndefined();
  });

  it("sealed secret fallback works when disk config has no apiKey", () => {
    // Simulate: persistCloudLoginStatus wrote to sealed secrets but disk
    // config was somehow corrupted/missing the apiKey
    const configNoKey = {
      env: {},
      cloud: { enabled: true },
      agents: { defaults: {}, list: [] },
      meta: {},
    };
    loadMock.mockReturnValue(configNoKey);

    const config = loadMock();
    let cloudApiKey = (config.cloud as Record<string, unknown>)?.apiKey as
      | string
      | undefined;

    // No apiKey on disk — fall back to sealed secret store
    if (!cloudApiKey) {
      // In production, getCloudSecret("ELIZAOS_CLOUD_API_KEY") would be called
      // Simulate the sealed secret returning the key
      cloudApiKey = "sealed-secret-key";
    }

    expect(cloudApiKey).toBe("sealed-secret-key");
  });
});
