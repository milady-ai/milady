import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/config", () => ({
  loadElizaConfig: vi.fn(),
  saveElizaConfig: vi.fn(),
}));

import { loadElizaConfig, saveElizaConfig } from "../../config/config";
import {
  deriveCompatOnboardingReplayBody,
  extractAndPersistOnboardingApiKey,
  persistCompatOnboardingDefaults,
} from "../server-onboarding-compat";

const mockLoadElizaConfig = loadElizaConfig as ReturnType<typeof vi.fn>;
const mockSaveElizaConfig = saveElizaConfig as ReturnType<typeof vi.fn>;

describe("extractAndPersistOnboardingApiKey", () => {
  let envSnapshot: Record<string, string | undefined>;

  beforeEach(() => {
    envSnapshot = {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      GROQ_API_KEY: process.env.GROQ_API_KEY,
    };
    mockLoadElizaConfig.mockReset();
    mockSaveElizaConfig.mockReset();
    mockLoadElizaConfig.mockReturnValue({ env: {} });
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(envSnapshot)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("persists Anthropic API key from connection.apiKey to config and process.env", async () => {
    const config = { env: {} } as Record<string, unknown>;
    mockLoadElizaConfig.mockReturnValue(config);

    const result = await extractAndPersistOnboardingApiKey({
      name: "TestAgent",
      connection: {
        kind: "local-provider",
        provider: "anthropic",
        apiKey: "sk-ant-test-key-123",
      },
    });

    expect(result).toBe("ANTHROPIC_API_KEY");
    expect(mockSaveElizaConfig).toHaveBeenCalledTimes(1);

    const savedConfig = mockSaveElizaConfig.mock.calls[0][0];
    expect(savedConfig.env.ANTHROPIC_API_KEY).toBe("sk-ant-test-key-123");
    expect(savedConfig.cloud).toEqual({
      enabled: false,
      inferenceMode: "byok",
      runtime: "local",
      services: { inference: false },
    });
    expect(process.env.ANTHROPIC_API_KEY).toBe("sk-ant-test-key-123");
  });

  it("persists OpenAI API key", async () => {
    const config = { env: {} } as Record<string, unknown>;
    mockLoadElizaConfig.mockReturnValue(config);

    const result = await extractAndPersistOnboardingApiKey({
      connection: {
        kind: "local-provider",
        provider: "openai",
        apiKey: "sk-openai-test-key",
      },
    });

    expect(result).toBe("OPENAI_API_KEY");
    const savedConfig = mockSaveElizaConfig.mock.calls[0][0];
    expect(savedConfig.env.OPENAI_API_KEY).toBe("sk-openai-test-key");
  });

  it("returns null when connection field is missing", async () => {
    const result = await extractAndPersistOnboardingApiKey({
      name: "TestAgent",
    });

    expect(result).toBeNull();
    expect(mockSaveElizaConfig).not.toHaveBeenCalled();
  });

  it("returns null when apiKey is empty", async () => {
    const result = await extractAndPersistOnboardingApiKey({
      connection: {
        kind: "local-provider",
        provider: "anthropic",
        apiKey: "   ",
      },
    });

    expect(result).toBeNull();
    expect(mockSaveElizaConfig).not.toHaveBeenCalled();
  });

  it("returns null when apiKey is missing", async () => {
    const result = await extractAndPersistOnboardingApiKey({
      connection: {
        kind: "local-provider",
        provider: "anthropic",
      },
    });

    expect(result).toBeNull();
    expect(mockSaveElizaConfig).not.toHaveBeenCalled();
  });

  it("returns null for unknown provider", async () => {
    const result = await extractAndPersistOnboardingApiKey({
      connection: {
        kind: "local-provider",
        provider: "unknown-provider",
        apiKey: "some-key",
      },
    });

    expect(result).toBeNull();
    expect(mockSaveElizaConfig).not.toHaveBeenCalled();
  });

  it("creates env object on config if missing", async () => {
    const config = {} as Record<string, unknown>;
    mockLoadElizaConfig.mockReturnValue(config);

    const result = await extractAndPersistOnboardingApiKey({
      connection: {
        kind: "local-provider",
        provider: "groq",
        apiKey: "gsk-groq-test",
      },
    });

    expect(result).toBe("GROQ_API_KEY");
    const savedConfig = mockSaveElizaConfig.mock.calls[0][0];
    expect(savedConfig.env.GROQ_API_KEY).toBe("gsk-groq-test");
  });

  it("handles google-genai provider", async () => {
    const config = { env: {} } as Record<string, unknown>;
    mockLoadElizaConfig.mockReturnValue(config);

    const result = await extractAndPersistOnboardingApiKey({
      connection: {
        kind: "local-provider",
        provider: "google-genai",
        apiKey: "AIza-google-key",
      },
    });

    expect(result).toBe("GOOGLE_GENERATIVE_AI_API_KEY");
  });

  it("handles gemini provider ID (catalog uses gemini, not google-genai)", async () => {
    const config = { env: {} } as Record<string, unknown>;
    mockLoadElizaConfig.mockReturnValue(config);

    const result = await extractAndPersistOnboardingApiKey({
      connection: {
        kind: "local-provider",
        provider: "gemini",
        apiKey: "AIza-gemini-key",
      },
    });

    expect(result).toBe("GOOGLE_GENERATIVE_AI_API_KEY");
  });

  it("handles grok provider ID (catalog uses grok, not xai)", async () => {
    const config = { env: {} } as Record<string, unknown>;
    mockLoadElizaConfig.mockReturnValue(config);

    const result = await extractAndPersistOnboardingApiKey({
      connection: {
        kind: "local-provider",
        provider: "grok",
        apiKey: "xai-grok-key",
      },
    });

    expect(result).toBe("XAI_API_KEY");
  });

  it.each([
    ["deepseek", "DEEPSEEK_API_KEY"],
    ["mistral", "MISTRAL_API_KEY"],
    ["together", "TOGETHER_API_KEY"],
    ["zai", "ZAI_API_KEY"],
  ])("handles %s provider", async (provider, expectedEnvKey) => {
    const config = { env: {} } as Record<string, unknown>;
    mockLoadElizaConfig.mockReturnValue(config);

    const result = await extractAndPersistOnboardingApiKey({
      connection: {
        kind: "local-provider",
        provider,
        apiKey: `test-key-${provider}`,
      },
    });

    expect(result).toBe(expectedEnvKey);
  });
  it("returns null when provider is not a string", async () => {
    const result = await extractAndPersistOnboardingApiKey({
      connection: {
        kind: "local-provider",
        provider: 123,
        apiKey: "some-key",
      },
    });

    expect(result).toBeNull();
  });
});

describe("persistCompatOnboardingDefaults", () => {
  beforeEach(() => {
    mockSaveElizaConfig.mockClear();
  });

  it("persists the compat admin entity id and agent metadata into agents.list", () => {
    const config = {
      agents: {
        defaults: {},
      },
    } as Record<string, unknown>;
    mockLoadElizaConfig.mockReturnValue(config);

    const adminEntityId = persistCompatOnboardingDefaults({
      name: "Milady",
      bio: ["A compat bio line"],
      systemPrompt: "You are Milady.",
    });

    expect(adminEntityId).toEqual(expect.any(String));
    expect(mockSaveElizaConfig).toHaveBeenCalledTimes(1);

    const savedConfig = mockSaveElizaConfig.mock.calls[0][0];
    expect(savedConfig.agents.defaults.adminEntityId).toBe(adminEntityId);
    expect(savedConfig.agents.list[0]).toMatchObject({
      id: "main",
      default: true,
      name: "Milady",
      bio: ["A compat bio line"],
      system: "You are Milady.",
    });
  });

  it("persists style, adjectives, topics, postExamples, and messageExamples", () => {
    const config = {
      agents: { defaults: {} },
    } as Record<string, unknown>;
    mockLoadElizaConfig.mockReturnValue(config);

    persistCompatOnboardingDefaults({
      name: "Chen",
      bio: ["A warm analyst."],
      systemPrompt: "You are Chen.",
      style: { all: ["be brief"], chat: ["lowercase"], post: ["no emoji"] },
      adjectives: ["warm", "gentle"],
      topics: ["emotional intelligence", "design thinking"],
      postExamples: ["goodnight everyone", "you've got this"],
      messageExamples: [
        [
          { user: "{{user1}}", content: { text: "hi" } },
          { user: "Chen", content: { text: "hey there!" } },
        ],
      ],
    });

    expect(mockSaveElizaConfig).toHaveBeenCalledTimes(1);
    const saved = mockSaveElizaConfig.mock.calls[0][0];
    const agent = saved.agents.list[0];
    expect(agent.name).toBe("Chen");
    expect(agent.style).toEqual({
      all: ["be brief"],
      chat: ["lowercase"],
      post: ["no emoji"],
    });
    expect(agent.adjectives).toEqual(["warm", "gentle"]);
    expect(agent.topics).toEqual(["emotional intelligence", "design thinking"]);
    expect(agent.postExamples).toEqual([
      "goodnight everyone",
      "you've got this",
    ]);
    expect(agent.messageExamples).toHaveLength(1);
  });

  it("skips non-array/non-object character fields gracefully", () => {
    const config = {
      agents: { defaults: {} },
    } as Record<string, unknown>;
    mockLoadElizaConfig.mockReturnValue(config);

    persistCompatOnboardingDefaults({
      name: "Test",
      style: "not-an-object",
      adjectives: "not-an-array",
      topics: 42,
      postExamples: null,
      messageExamples: "nope",
    });

    const saved = mockSaveElizaConfig.mock.calls[0][0];
    const agent = saved.agents.list[0];
    expect(agent.name).toBe("Test");
    expect(agent.style).toBeUndefined();
    expect(agent.adjectives).toBeUndefined();
    expect(agent.topics).toBeUndefined();
    expect(agent.postExamples).toBeUndefined();
    expect(agent.messageExamples).toBeUndefined();
  });

  it("returns null when compat onboarding has no usable name", () => {
    const result = persistCompatOnboardingDefaults({
      name: "   ",
      bio: ["ignored"],
    });

    expect(result).toBeNull();
    expect(mockSaveElizaConfig).not.toHaveBeenCalled();
  });
});

describe("deriveCompatOnboardingReplayBody", () => {
  it("injects runMode=cloud for cloud-managed onboarding connections", () => {
    const body = {
      name: "Milady",
      connection: {
        kind: "cloud-managed",
        provider: "elizacloud",
      },
    } as Record<string, unknown>;

    const result = deriveCompatOnboardingReplayBody(body);

    expect(result.isCloudMode).toBe(true);
    expect(result.replayBody).toMatchObject({
      name: "Milady",
      runMode: "cloud",
      connection: {
        kind: "cloud-managed",
        provider: "elizacloud",
      },
    });
    expect(body.runMode).toBeUndefined();
  });

  it("leaves non-cloud onboarding payloads unchanged", () => {
    const body = {
      name: "Milady",
      connection: {
        kind: "local-provider",
        provider: "openai",
        apiKey: "sk-test-openai",
      },
    } as Record<string, unknown>;

    const result = deriveCompatOnboardingReplayBody(body);

    expect(result.isCloudMode).toBe(false);
    expect(result.replayBody).toMatchObject({
      name: "Milady",
      runMode: "local",
      provider: "openai",
      providerApiKey: "sk-test-openai",
    });
  });
});
