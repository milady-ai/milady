import type { IAgentRuntime } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { CodingTaskExecutor } from "./coding-task-executor";
import { createDefaultExecutorRegistry } from "./executor-registry";
import { ResearchTaskExecutor } from "./research-task-executor";
import {
  type TaskExecutor,
  TaskExecutorRegistry,
  type TaskResult,
  type TaskSpec,
} from "./task-executor";

function makeExecutor(type: string, canHandle: boolean): TaskExecutor {
  return {
    type,
    description: `${type} executor`,
    canHandle: () => canHandle,
    execute: async (spec: TaskSpec): Promise<TaskResult> => ({
      taskId: spec.id,
      success: true,
    }),
    abort: async () => {},
  };
}

describe("TaskExecutorRegistry", () => {
  it("prefers an explicit type match when that executor can handle the task", () => {
    const registry = new TaskExecutorRegistry();
    const coding = makeExecutor("coding", true);
    const research = makeExecutor("research", true);
    registry.register(coding);
    registry.register(research);

    const runtime = {} as IAgentRuntime;
    const spec: TaskSpec = {
      id: "task-1",
      type: "research",
      description: "investigate the issue",
    };

    expect(registry.findExecutor(spec, runtime)).toBe(research);
  });

  it("falls back to the first executor that can handle a task", () => {
    const registry = new TaskExecutorRegistry();
    const coding = makeExecutor("coding", false);
    const research = makeExecutor("research", true);
    registry.register(coding);
    registry.register(research);

    const runtime = {} as IAgentRuntime;
    const spec: TaskSpec = {
      id: "task-2",
      type: "",
      description: "compare providers",
    };

    expect(registry.findExecutor(spec, runtime)).toBe(research);
  });

  it("creates a default registry with built-in coding and research executors", () => {
    const registry = createDefaultExecutorRegistry();

    expect(registry.get("coding")).toBeInstanceOf(CodingTaskExecutor);
    expect(registry.get("research")).toBeInstanceOf(ResearchTaskExecutor);
    expect(registry.getAll()).toHaveLength(2);
  });
});
