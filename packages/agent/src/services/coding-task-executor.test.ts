import type { IAgentRuntime } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { CodingTaskExecutor } from "./coding-task-executor";

describe("CodingTaskExecutor", () => {
  it("matches explicit coding tasks when the CODE_TASK service exists", () => {
    const executor = new CodingTaskExecutor();
    const runtime = {
      getService: vi.fn().mockReturnValue({}),
    } as unknown as IAgentRuntime;

    expect(
      executor.canHandle(
        {
          id: "task-1",
          type: "coding",
          description: "write a feature",
        },
        runtime,
      ),
    ).toBe(true);
  });

  it("matches coding verbs heuristically", () => {
    const executor = new CodingTaskExecutor();
    const runtime = {
      getService: vi.fn().mockReturnValue({}),
    } as unknown as IAgentRuntime;

    expect(
      executor.canHandle(
        {
          id: "task-2",
          type: "",
          description: "fix the broken command palette",
        },
        runtime,
      ),
    ).toBe(true);
  });

  it("returns false when the CODE_TASK service is unavailable", () => {
    const executor = new CodingTaskExecutor();
    const runtime = {
      getService: vi.fn().mockReturnValue(null),
    } as unknown as IAgentRuntime;

    expect(
      executor.canHandle(
        {
          id: "task-3",
          type: "coding",
          description: "build a dashboard",
        },
        runtime,
      ),
    ).toBe(false);
  });

  it("delegates task creation to the CODE_TASK service", async () => {
    const executor = new CodingTaskExecutor();
    const service = {
      createTask: vi.fn().mockResolvedValue({ id: "code-task-123" }),
      cancelTask: vi.fn(),
    };
    const runtime = {
      getService: vi.fn().mockReturnValue(service),
    } as unknown as IAgentRuntime;

    const result = await executor.execute(
      {
        id: "task-4",
        type: "coding",
        description:
          "build a robust code generation panel with useful defaults",
        agentType: "codex",
      },
      runtime,
    );

    expect(service.createTask).toHaveBeenCalledWith(
      "build a robust code generation panel with useful defaults",
      "build a robust code generation panel with useful defaults",
      undefined,
      "codex",
    );
    expect(result).toMatchObject({
      taskId: "task-4",
      success: true,
      output: "code-task-123",
    });
    expect(result.durationMs).toBeTypeOf("number");
  });

  it("surfaces CODE_TASK failures without throwing", async () => {
    const executor = new CodingTaskExecutor();
    const runtime = {
      getService: vi.fn().mockReturnValue({
        createTask: vi
          .fn()
          .mockRejectedValue(new Error("orchestrator offline")),
        cancelTask: vi.fn(),
      }),
    } as unknown as IAgentRuntime;

    const result = await executor.execute(
      {
        id: "task-5",
        type: "coding",
        description: "fix the task panel",
      },
      runtime,
    );

    expect(result).toMatchObject({
      taskId: "task-5",
      success: false,
      error: "orchestrator offline",
    });
  });
});
