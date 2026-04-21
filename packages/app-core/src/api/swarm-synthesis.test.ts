import type { AgentRuntime } from "@elizaos/core";
import { handleSwarmSynthesis } from "@miladyai/agent/api/server";
import { describe, expect, it, vi } from "vitest";

function makePayload(
  overrides?: Partial<Parameters<typeof handleSwarmSynthesis>[1]>,
) {
  return {
    tasks: [
      {
        sessionId: "s1",
        label: "Agent 1",
        agentType: "claude",
        originalTask: "Fix the bug",
        status: "completed",
        completionSummary: "Bug fixed in main.ts",
      },
    ],
    total: 1,
    completed: 1,
    stopped: 0,
    errored: 0,
    ...overrides,
  };
}

describe("handleSwarmSynthesis", () => {
  it("routes deterministic synthesis to user on success", async () => {
    const useModel = vi
      .fn()
      .mockResolvedValue("All tasks completed successfully!");
    const st = {
      runtime: {
        useModel,
        getService: vi.fn().mockReturnValue(null),
      } as AgentRuntime,
    };
    const routeMessage = vi.fn();

    await handleSwarmSynthesis(st, makePayload(), routeMessage);

    expect(useModel).not.toHaveBeenCalled();
    expect(routeMessage).toHaveBeenCalledWith(
      "done — Bug fixed in main.ts",
      "swarm_synthesis",
    );
  });

  it("falls back to the original task text when completion summary is missing", async () => {
    const useModel = vi.fn().mockResolvedValue("   ");
    const st = {
      runtime: {
        useModel,
        getService: vi.fn().mockReturnValue(null),
      } as AgentRuntime,
    };
    const routeMessage = vi.fn();

    await handleSwarmSynthesis(
      st,
      makePayload({
        tasks: [
          {
            sessionId: "s1",
            label: "Agent 1",
            agentType: "claude",
            originalTask: "Fix the bug",
            status: "completed",
            completionSummary: "",
          },
        ],
      }),
      routeMessage,
    );

    expect(useModel).not.toHaveBeenCalled();
    expect(routeMessage).toHaveBeenCalledWith(
      "done — Fix the bug",
      "swarm_synthesis",
    );
  });

  it("formats multi-task synthesis without using the LLM", async () => {
    const useModel = vi.fn().mockRejectedValue(new Error("LLM unavailable"));
    const st = {
      runtime: {
        useModel,
        getService: vi.fn().mockReturnValue(null),
      } as AgentRuntime,
    };
    const routeMessage = vi.fn();

    const payload = makePayload({
      tasks: [
        {
          sessionId: "s1",
          label: "Agent 1",
          agentType: "claude",
          originalTask: "Fix the bug",
          status: "completed",
          completionSummary: "Bug fixed in main.ts",
        },
        {
          sessionId: "s2",
          label: "Agent 2",
          agentType: "codex",
          originalTask: "Update docs",
          status: "stopped",
          completionSummary: "Docs updated in README.md",
        },
      ],
      total: 2,
      completed: 2,
      stopped: 0,
      errored: 0,
    });
    await handleSwarmSynthesis(st, payload, routeMessage);

    expect(useModel).not.toHaveBeenCalled();
    expect(routeMessage).toHaveBeenCalledWith(
      "done — 2 tasks:\n• Bug fixed in main.ts\n• Docs updated in README.md",
      "swarm_synthesis",
    );
  });

  it("skips synthesis when runtime is null", async () => {
    const routeMessage = vi.fn();

    await handleSwarmSynthesis({ runtime: null }, makePayload(), routeMessage);

    expect(routeMessage).not.toHaveBeenCalled();
  });
});
