import type http from "node:http";
import type { AgentRuntime } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import {
  handleWorkbenchRoutes,
  type WorkbenchRouteContext,
} from "./workbench-routes";

function createTodoView(id = "todo-123") {
  return {
    id,
    name: "Follow up",
    description: "Call the user back",
    priority: null,
    isUrgent: false,
    type: "task",
    isCompleted: false,
    tags: ["bootstrap-pending", "bootstrap"],
    createdAt: null,
    updatedAt: null,
  };
}

describe("workbench todo routes", () => {
  it("keeps GET /api/workbench/todos read-only when the list is empty", async () => {
    const json = vi.fn();
    const error = vi.fn();
    const runtime = {
      agentId: "agent-1",
      getTasks: vi.fn().mockResolvedValue([]),
      getService: vi.fn().mockReturnValue(null),
      logger: { warn: vi.fn() },
    };

    await handleWorkbenchRoutes({
      req: {} as http.IncomingMessage,
      res: {} as http.ServerResponse,
      method: "GET",
      pathname: "/api/workbench/todos",
      url: new URL("http://localhost/api/workbench/todos"),
      state: {
        runtime: runtime as unknown as AgentRuntime,
        adminEntityId: null,
      },
      json,
      error,
      readJsonBody: vi.fn(),
      toWorkbenchTask: vi.fn(),
      toWorkbenchTodo: vi.fn().mockReturnValue(null),
      normalizeTags: vi
        .fn()
        .mockImplementation((value: unknown, required: string[] = []) => [
          ...required,
          ...(Array.isArray(value) ? value : []),
        ]),
      readTaskMetadata: vi.fn(),
      readTaskCompleted: vi.fn(),
      parseNullableNumber: vi.fn(),
      asObject: vi.fn(),
      decodePathComponent: vi.fn(),
      taskToTriggerSummary: vi.fn(),
      listTriggerTasks: vi.fn(),
    } as unknown as WorkbenchRouteContext);

    expect(json).toHaveBeenCalledWith(expect.anything(), {
      todos: [],
    });
    expect(runtime.getTasks).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });

  it("marks runtime-backed todos completed through POST /api/workbench/todos/:id/complete", async () => {
    const json = vi.fn();
    const error = vi.fn();
    const todoTask = {
      id: "todo-123",
      name: "Follow up",
      description: "Call the user back",
      metadata: {
        source: "existing-metadata",
        workbenchTodo: {
          description: "Call the user back",
          isUrgent: false,
          priority: 2,
          type: "task",
        },
      },
    };
    const runtime = {
      agentId: "agent-1",
      getTask: vi.fn().mockResolvedValue(todoTask),
      updateTask: vi.fn().mockResolvedValue(undefined),
      getService: vi.fn().mockReturnValue(null),
      logger: { warn: vi.fn() },
    };
    const readTaskMetadata = vi
      .fn()
      .mockReturnValue(todoTask.metadata as Record<string, unknown>);

    await handleWorkbenchRoutes({
      req: {} as http.IncomingMessage,
      res: {} as http.ServerResponse,
      method: "POST",
      pathname: "/api/workbench/todos/todo-123/complete",
      url: new URL("http://localhost/api/workbench/todos/todo-123/complete"),
      state: {
        runtime: runtime as unknown as AgentRuntime,
        adminEntityId: null,
      },
      json,
      error,
      readJsonBody: vi.fn().mockResolvedValue({ isCompleted: true }),
      toWorkbenchTask: vi.fn(),
      toWorkbenchTodo: vi
        .fn()
        .mockReturnValue(createTodoView("todo-123")),
      normalizeTags: vi.fn(),
      readTaskMetadata,
      readTaskCompleted: vi.fn(),
      parseNullableNumber: vi.fn(),
      asObject: vi
        .fn()
        .mockImplementation((value: unknown) =>
          value && typeof value === "object" && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : null,
        ),
      decodePathComponent: vi.fn().mockReturnValue("todo-123"),
      taskToTriggerSummary: vi.fn(),
      listTriggerTasks: vi.fn(),
    } as unknown as WorkbenchRouteContext);

    expect(runtime.updateTask).toHaveBeenCalledWith("todo-123", {
      metadata: {
        source: "existing-metadata",
        isCompleted: true,
        workbenchTodo: {
          description: "Call the user back",
          isUrgent: false,
          priority: 2,
          type: "task",
          isCompleted: true,
        },
      },
    });
    expect(json).toHaveBeenCalledWith(expect.anything(), { ok: true });
    expect(error).not.toHaveBeenCalled();
  });
});
