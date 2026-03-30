import type { AgentRuntime } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectRuntimeModel } from "./agent-model";

function makeRuntime(overrides: Partial<AgentRuntime>): AgentRuntime {
  return {
    plugins: [],
    ...overrides,
  } as unknown as AgentRuntime;
}

describe("detectRuntimeModel", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.XAI_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.ELIZA_USE_PI_AI;
    delete process.env.MILADY_USE_PI_AI;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns undefined when runtime is null", () => {
    expect(detectRuntimeModel(null)).toBeUndefined();
  });

  it("prefers explicit character.settings.model.primary", () => {
    const runtime = makeRuntime({
      character: {
        name: "Eliza",
        settings: {
          model: {
            primary: "openai/gpt-5.2",
          },
        },
      } as AgentRuntime["character"],
      plugins: [{ name: "moonshot-kimi" }] as AgentRuntime["plugins"],
    });

    expect(detectRuntimeModel(runtime)).toBe("openai/gpt-5.2");
  });

  it("prefers config.connection local-provider model over config defaults and plugin hints", () => {
    const runtime = makeRuntime({
      character: { name: "Eliza" } as AgentRuntime["character"],
      plugins: [
        { name: "@elizaos/plugin-anthropic" },
      ] as AgentRuntime["plugins"],
    });

    expect(
      detectRuntimeModel(runtime, {
        connection: {
          kind: "local-provider",
          provider: "openrouter",
          primaryModel: "openai/gpt-5.2",
        },
        agents: { defaults: { model: { primary: "anthropic" } } },
      }),
    ).toBe("openai/gpt-5.2");
  });

  it("falls back to the selected local provider id when no primaryModel is set", () => {
    const runtime = makeRuntime({
      character: { name: "Eliza" } as AgentRuntime["character"],
    });

    expect(
      detectRuntimeModel(runtime, {
        connection: {
          kind: "local-provider",
          provider: "ollama",
        },
      }),
    ).toBe("ollama");
  });

  it("prefers remote-provider selection details over plugin and env hints", () => {
    const runtime = makeRuntime({
      character: { name: "Eliza" } as AgentRuntime["character"],
      plugins: [{ name: "@elizaos/plugin-openai" }] as AgentRuntime["plugins"],
    });

    expect(
      detectRuntimeModel(runtime, {
        connection: {
          kind: "remote-provider",
          remoteApiBase: "https://remote.example",
          provider: "deepseek",
          primaryModel: "deepseek/chat",
        },
      }),
    ).toBe("deepseek/chat");
  });

  it("prefers cloud-managed selected models over other hints", () => {
    const runtime = makeRuntime({
      character: { name: "Eliza" } as AgentRuntime["character"],
      plugins: [{ name: "@elizaos/plugin-openai" }] as AgentRuntime["plugins"],
    });

    expect(
      detectRuntimeModel(runtime, {
        connection: {
          kind: "cloud-managed",
          cloudProvider: "elizacloud",
          smallModel: "openai/gpt-5-mini",
          largeModel: "anthropic/claude-sonnet-4.5",
        },
      }),
    ).toBe("anthropic/claude-sonnet-4.5");
  });

  it("falls back to config model.primary when no explicit connection exists", () => {
    const runtime = makeRuntime({
      character: { name: "Eliza" } as AgentRuntime["character"],
      plugins: [
        { name: "@elizaos/plugin-anthropic" },
      ] as AgentRuntime["plugins"],
    });
    const config = {
      agents: { defaults: { model: { primary: "openai/gpt-5.2" } } },
    };

    expect(detectRuntimeModel(runtime, config)).toBe("openai/gpt-5.2");
  });

  it("falls back to plugin scanning when config model.primary is absent", () => {
    const runtime = makeRuntime({
      character: { name: "Eliza" } as AgentRuntime["character"],
      plugins: [
        { name: "@elizaos/plugin-anthropic" },
      ] as AgentRuntime["plugins"],
    });

    expect(detectRuntimeModel(runtime, {})).toBe("@elizaos/plugin-anthropic");
  });

  it("uses canonical env labels when only runtime env signals remain", () => {
    const runtime = makeRuntime({
      character: { name: "Eliza" } as AgentRuntime["character"],
      plugins: [],
    });
    process.env.XAI_API_KEY = "xai-test-key";

    expect(detectRuntimeModel(runtime, {})).toBe("grok");
  });

  it("returns undefined when no model hints are available", () => {
    const runtime = makeRuntime({
      character: { name: "Eliza" } as AgentRuntime["character"],
      plugins: [{ name: "plugin-random-feature" }] as AgentRuntime["plugins"],
    });

    expect(detectRuntimeModel(runtime)).toBeUndefined();
  });
});
