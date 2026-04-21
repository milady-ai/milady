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
      actions: [],
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

  it("uses CREATE_TASK as the convergence path when CODE_TASK is unavailable", () => {
    const executor = new CodingTaskExecutor();
    const runtime = {
      getService: vi.fn().mockReturnValue(null),
      actions: [
        {
          name: "CREATE_TASK",
          handler: vi.fn(),
        },
      ],
    } as unknown as IAgentRuntime;

    expect(
      executor.canHandle(
        {
          id: "task-3b",
          type: "coding",
          description: "build a dashboard",
        },
        runtime,
      ),
    ).toBe(true);
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

  it("dispatches through CREATE_TASK when CODE_TASK is missing", async () => {
    const executor = new CodingTaskExecutor();
    const createTaskAction = {
      name: "CREATE_TASK",
      validate: vi.fn().mockResolvedValue(true),
      handler: vi.fn().mockResolvedValue({
        success: true,
        text: "created task",
        data: {
          agents: [{ sessionId: "session-123" }],
        },
      }),
    };
    const runtime = {
      agentId: "agent-1",
      getService: vi.fn().mockReturnValue(null),
      actions: [createTaskAction],
    } as unknown as IAgentRuntime;

    const result = await executor.execute(
      {
        id: "task-6",
        type: "coding",
        description: "implement the task drawer",
        agentType: "codex",
      },
      runtime,
    );

    expect(createTaskAction.validate).toHaveBeenCalled();
    expect(createTaskAction.handler).toHaveBeenCalledWith(
      runtime,
      expect.objectContaining({
        content: expect.objectContaining({
          text: "implement the task drawer",
          agentType: "codex",
        }),
      }),
      undefined,
      {
        parameters: {
          task: "implement the task drawer",
          agentType: "codex",
        },
      },
      expect.any(Function),
    );
    expect(result).toMatchObject({
      taskId: "task-6",
      success: true,
      output: "session-123",
    });
  });
});
