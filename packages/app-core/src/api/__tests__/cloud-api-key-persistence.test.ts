/**
 * Regression tests for cloud API key persistence through onboarding.
 *
 * BUG: When a user connects to Eliza Cloud during onboarding, the cloud
 * API key was not persisted to ~/.eliza/eliza.json. This caused Settings
 * to show "Connect to Eliza Cloud" buttons and cloud billing/compat API
 * calls to return 401.
 *
 * ROOT CAUSE: The /api/cloud/login/status poll was falling through to the
 * upstream handler instead of being routed through Milady's handleCloudRoute.
 * Additionally, /api/cloud/billing/* routes used the upstream's stale
 * in-memory state.config instead of reading fresh config from disk.
 *
 * FIX: Route all /api/cloud/* paths (except compat/billing which have
 * dedicated handlers) through Milady's handleCloudRoute. Add billing
 * route handler in the compat layer with loadElizaConfig() for fresh reads.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────

const loadElizaConfigMock = vi.fn();
const saveElizaConfigMock = vi.fn();

vi.mock("../../config/config", () => ({
  loadElizaConfig: (...args: unknown[]) => loadElizaConfigMock(...args),
  saveElizaConfig: (...args: unknown[]) => saveElizaConfigMock(...args),
}));

vi.mock("@elizaos/core", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
  stringToUuid: (s: string) => `uuid-${s}`,
}));

vi.mock("@miladyai/agent/cloud/validate-url", () => ({
  validateCloudBaseUrl: vi.fn(() => Promise.resolve(null)),
}));

import {
  extractAndPersistOnboardingApiKey,
  persistCompatOnboardingDefaults,
} from "../server-onboarding-compat";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeConfig(cloud?: Record<string, unknown>) {
  return {
    env: {},
    agents: { defaults: {}, list: [{ id: "main", default: true }] },
    cloud: cloud ?? {},
    meta: {},
    models: {},
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("cloud API key persistence through onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.ELIZAOS_CLOUD_API_KEY;
    delete process.env.ELIZAOS_CLOUD_ENABLED;
  });

  describe("extractAndPersistOnboardingApiKey normalizes connection state", () => {
    it("disables stale cloud inference while preserving cloud auth when saving a local provider key", async () => {
      const config = makeConfig({
        enabled: true,
        apiKey: "cloud-key-abc",
        inferenceMode: "cloud",
        runtime: "cloud",
      });
      loadElizaConfigMock.mockReturnValue(config);

      await extractAndPersistOnboardingApiKey({
        name: "TestAgent",
        connection: {
          kind: "local-provider",
          provider: "anthropic",
          apiKey: "sk-ant-test-key-123",
        },
      });

      expect(saveElizaConfigMock).toHaveBeenCalledTimes(1);
      const saved = saveElizaConfigMock.mock.calls[0][0];
      expect(saved.cloud).toEqual({
        enabled: false,
        apiKey: "cloud-key-abc",
        inferenceMode: "byok",
        runtime: "local",
        services: { inference: false },
      });
      expect(saved.env.ANTHROPIC_API_KEY).toBe("sk-ant-test-key-123");
    });

    it("persists cloud-managed connections while still returning null", async () => {
      const config = makeConfig();
      loadElizaConfigMock.mockReturnValue(config);

      const result = await extractAndPersistOnboardingApiKey({
        name: "TestAgent",
        connection: {
          kind: "cloud-managed",
          apiKey: "cloud-key-abc",
          smallModel: "openai/gpt-5-mini",
          largeModel: "moonshotai/kimi-k2-0905",
        },
      });

      expect(result).toBeNull();
      expect(saveElizaConfigMock).toHaveBeenCalledTimes(1);
      const saved = saveElizaConfigMock.mock.calls[0][0];
      expect(saved.cloud.apiKey).toBe("cloud-key-abc");
      expect(saved.cloud.enabled).toBe(true);
      expect(saved.models.small).toBe("openai/gpt-5-mini");
      expect(saved.models.large).toBe("moonshotai/kimi-k2-0905");
    });
  });

  describe("persistCompatOnboardingDefaults preserves cloud.apiKey", () => {
    it("does not remove cloud.apiKey when saving agent defaults", () => {
      const config = makeConfig({
        enabled: true,
        apiKey: "cloud-key-xyz",
        inferenceMode: "cloud",
      });
      loadElizaConfigMock.mockReturnValue(config);

      persistCompatOnboardingDefaults({
        name: "MyAgent",
        bio: ["An AI agent."],
        systemPrompt: "You are MyAgent.",
      });

      expect(saveElizaConfigMock).toHaveBeenCalledTimes(1);
      const saved = saveElizaConfigMock.mock.calls[0][0];
      expect(saved.cloud.apiKey).toBe("cloud-key-xyz");
      expect(saved.cloud.enabled).toBe(true);
      expect(saved.agents.list[0].name).toBe("MyAgent");
    });
  });

  describe("full onboarding sequence preserves cloud.apiKey", () => {
    it("cloud key survives extractApiKey → persistDefaults sequence", async () => {
      // Simulate: cloud login saved apiKey, then onboarding runs both functions
      const configWithKey = makeConfig({
        enabled: true,
        apiKey: "cloud-key-persisted",
        inferenceMode: "cloud",
      });

      // Both functions load fresh config — simulate the disk state
      loadElizaConfigMock.mockReturnValue(configWithKey);

      // 1. extractAndPersistOnboardingApiKey — no-op for cloud mode
      const result = await extractAndPersistOnboardingApiKey({
        name: "Chen",
        connection: {
          kind: "cloud-managed",
          apiKey: "cloud-key-persisted",
          smallModel: "openai/gpt-5-mini",
          largeModel: "moonshotai/kimi-k2-0905",
        },
      });
      expect(result).toBeNull();

      // 2. persistCompatOnboardingDefaults — should preserve cloud.apiKey
      persistCompatOnboardingDefaults({
        name: "Chen",
        bio: ["An agent."],
      });

      expect(saveElizaConfigMock).toHaveBeenCalledTimes(2);
      const saved = saveElizaConfigMock.mock.calls[1][0];
      expect(saved.cloud.apiKey).toBe("cloud-key-persisted");
    });

    it("switching to a local provider preserves the prior cloud key but disables cloud inference", async () => {
      const config = makeConfig({
        enabled: true,
        apiKey: "cloud-key-dual",
      });
      loadElizaConfigMock.mockReturnValue(config);

      // extractAndPersistOnboardingApiKey with a local provider key
      await extractAndPersistOnboardingApiKey({
        name: "Agent",
        connection: {
          kind: "local-provider",
          provider: "openai",
          apiKey: "sk-openai-test",
        },
      });

      const saved1 = saveElizaConfigMock.mock.calls[0][0];
      expect(saved1.cloud).toEqual({
        enabled: false,
        apiKey: "cloud-key-dual",
        inferenceMode: "byok",
        runtime: "local",
        services: { inference: false },
      });
      expect(saved1.env.OPENAI_API_KEY).toBe("sk-openai-test");

      // persistCompatOnboardingDefaults
      loadElizaConfigMock.mockReturnValue(saved1);
      persistCompatOnboardingDefaults({ name: "Agent" });

      const saved2 = saveElizaConfigMock.mock.calls[1][0];
      expect(saved2.cloud).toEqual({
        enabled: false,
        apiKey: "cloud-key-dual",
        inferenceMode: "byok",
        runtime: "local",
        services: { inference: false },
      });
    });
  });
});
