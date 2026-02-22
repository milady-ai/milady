import { describe, expect, it } from "bun:test";
import { loadPiAiPluginConfig } from "../config.ts";

describe("plugin-pi-ai config", () => {
  it("loads defaults", () => {
    const config = loadPiAiPluginConfig({});

    expect(config.priority).toBe(10_000);
    expect(config.agentDir).toBeUndefined();
    expect(config.modelSpec).toBeUndefined();
  });

  it("parses model specs + priority", () => {
    const config = loadPiAiPluginConfig({
      PI_AI_MODEL_SPEC: "anthropic/claude-sonnet-4-20250514",
      PI_AI_SMALL_MODEL_SPEC: "anthropic/claude-3-5-haiku-20241022",
      PI_AI_LARGE_MODEL_SPEC: "openai/gpt-5",
      PI_AI_PRIORITY: "20001",
      PI_CODING_AGENT_DIR: "/tmp/pi-agent",
    });

    expect(config.modelSpec).toBe("anthropic/claude-sonnet-4-20250514");
    expect(config.smallModelSpec).toBe("anthropic/claude-3-5-haiku-20241022");
    expect(config.largeModelSpec).toBe("openai/gpt-5");
    expect(config.priority).toBe(20001);
    expect(config.agentDir).toBe("/tmp/pi-agent");
  });

  it("rejects invalid model spec", () => {
    expect(() =>
      loadPiAiPluginConfig({
        PI_AI_MODEL_SPEC: "not-a-model-spec",
      }),
    ).toThrow("Invalid model spec");
  });

  it("rejects out-of-range priority", () => {
    expect(() =>
      loadPiAiPluginConfig({
        PI_AI_PRIORITY: "0",
      }),
    ).toThrow();
  });
});
