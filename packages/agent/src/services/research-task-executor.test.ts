import { type IAgentRuntime, ModelType } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { ResearchTaskExecutor } from "./research-task-executor";

describe("ResearchTaskExecutor", () => {
  it("matches explicit research tasks and research verbs", () => {
    const executor = new ResearchTaskExecutor();
    const runtime = {} as IAgentRuntime;

    expect(
      executor.canHandle(
        {
          id: "task-1",
          type: "research",
          description: "compare providers",
        },
        runtime,
      ),
    ).toBe(true);

    expect(
      executor.canHandle(
        {
          id: "task-2",
          type: "",
          description: "investigate current benchmark tradeoffs",
        },
        runtime,
      ),
    ).toBe(true);
  });

  it("decomposes questions, answers each part, and synthesizes a final report", async () => {
    const useModel = vi
      .fn()
      .mockResolvedValueOnce(
        '```json\n["What changed?","What are the risks?"]\n```',
      )
      .mockResolvedValueOnce("Change one answer")
      .mockResolvedValueOnce("Risk answer")
      .mockResolvedValueOnce("Final structured report");
    const runtime = {
      useModel,
    } as unknown as IAgentRuntime;

    const executor = new ResearchTaskExecutor();
    const result = await executor.execute(
      {
        id: "task-3",
        type: "research",
        description: "Review the provider switch implementation",
      },
      runtime,
    );

    expect(useModel).toHaveBeenCalledTimes(4);
    for (const [modelType] of useModel.mock.calls) {
      expect(modelType).toBe(ModelType.TEXT_LARGE);
    }
    expect(result).toMatchObject({
      taskId: "task-3",
      success: true,
      output: "Final structured report",
    });
  });

  it("falls back to the original question when decomposition is not valid JSON", async () => {
    const useModel = vi
      .fn()
      .mockResolvedValueOnce("not json")
      .mockResolvedValueOnce("Single answer")
      .mockResolvedValueOnce("Fallback report");
    const runtime = {
      useModel,
    } as unknown as IAgentRuntime;

    const executor = new ResearchTaskExecutor();
    const result = await executor.execute(
      {
        id: "task-4",
        type: "research",
        description: "Summarize the benchmark runner",
      },
      runtime,
    );

    expect(useModel).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({
      taskId: "task-4",
      success: true,
      output: "Fallback report",
    });
  });
});
