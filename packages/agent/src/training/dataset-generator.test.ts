import type { IAgentRuntime } from "@elizaos/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockWithStandaloneTrajectory, mockLogActiveTrajectoryLlmCall } =
  vi.hoisted(() => ({
    mockWithStandaloneTrajectory: vi.fn(
      async (
        _runtime: IAgentRuntime | undefined,
        _options: Record<string, unknown>,
        callback: () => Promise<unknown>,
      ) => await callback(),
    ),
    mockLogActiveTrajectoryLlmCall: vi.fn(),
  }));

vi.mock("@elizaos/core", () => ({
  withStandaloneTrajectory: mockWithStandaloneTrajectory,
  logActiveTrajectoryLlmCall: mockLogActiveTrajectoryLlmCall,
}));

import {
  createAnthropicTeacher,
  createOpenAITeacher,
} from "./dataset-generator";

describe("dataset generator teacher trajectory logging", () => {
  const runtime = {
    agentId: "agent-1",
  } as IAgentRuntime;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("logs openai teacher calls inside a standalone training trajectory", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        model: "gpt-5-2026-04-01",
        choices: [{ message: { content: "teacher response" } }],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 8,
        },
      }),
    } as Response);

    const teacher = createOpenAITeacher("test-key", runtime);
    const text = await teacher.generate("system prompt", "user prompt");

    expect(text).toBe("teacher response");
    expect(mockWithStandaloneTrajectory).toHaveBeenCalledWith(
      runtime,
      {
        source: "training",
        metadata: {
          provider: "openai",
          model: "gpt-5.4",
          purpose: "teacher",
        },
      },
      expect.any(Function),
    );
    expect(mockLogActiveTrajectoryLlmCall).toHaveBeenCalledWith(
      runtime,
      expect.objectContaining({
        model: "openai/gpt-5.4",
        modelVersion: "gpt-5-2026-04-01",
        systemPrompt: "system prompt",
        userPrompt: "user prompt",
        response: "teacher response",
        purpose: "training.teacher",
        actionType: "training.teacher.openai.generate",
        promptTokens: 20,
        completionTokens: 8,
      }),
    );
  });

  it("logs anthropic teacher calls inside a standalone training trajectory", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "anthropic response" }],
        usage: {
          input_tokens: 14,
          output_tokens: 6,
        },
      }),
    } as Response);

    const teacher = createAnthropicTeacher("test-key", runtime);
    const text = await teacher.generate("system prompt", "user prompt");

    expect(text).toBe("anthropic response");
    expect(mockWithStandaloneTrajectory).toHaveBeenCalledWith(
      runtime,
      {
        source: "training",
        metadata: {
          provider: "anthropic",
          model: "claude-sonnet-4-20250514",
          purpose: "teacher",
        },
      },
      expect.any(Function),
    );
    expect(mockLogActiveTrajectoryLlmCall).toHaveBeenCalledWith(
      runtime,
      expect.objectContaining({
        model: "anthropic/claude-sonnet-4",
        modelVersion: "claude-sonnet-4-20250514",
        systemPrompt: "system prompt",
        userPrompt: "user prompt",
        response: "anthropic response",
        purpose: "training.teacher",
        actionType: "training.teacher.anthropic.generate",
        promptTokens: 14,
        completionTokens: 6,
      }),
    );
  });

  it("surfaces OpenAI API failures without logging a successful teacher call", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "rate limited",
    } as Response);

    const teacher = createOpenAITeacher("test-key", runtime);

    await expect(
      teacher.generate("system prompt", "user prompt"),
    ).rejects.toThrow("OpenAI API error: 429 rate limited");
    expect(mockWithStandaloneTrajectory).toHaveBeenCalledTimes(1);
    expect(mockLogActiveTrajectoryLlmCall).not.toHaveBeenCalled();
  });

  it("surfaces Anthropic API failures without logging a successful teacher call", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "internal error",
    } as Response);

    const teacher = createAnthropicTeacher("test-key", runtime);

    await expect(
      teacher.generate("system prompt", "user prompt"),
    ).rejects.toThrow("Anthropic API error: 500 internal error");
    expect(mockWithStandaloneTrajectory).toHaveBeenCalledTimes(1);
    expect(mockLogActiveTrajectoryLlmCall).not.toHaveBeenCalled();
  });
});
