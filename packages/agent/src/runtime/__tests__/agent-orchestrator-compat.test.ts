import { describe, expect, it, vi } from "vitest";
import orchestratorPlugin from "../agent-orchestrator-compat";

function createRuntime() {
  return {
    getSetting: vi.fn().mockReturnValue(undefined),
    getService: vi.fn().mockImplementation((name: string) => {
      if (name !== "PTY_SERVICE") {
        return undefined;
      }
      return {
        defaultApprovalPreset: "on-request",
        agentSelectionStrategy: "default",
        defaultAgentType: "claude",
        listSessions: vi.fn().mockResolvedValue([]),
        checkAvailableAgents: vi.fn().mockResolvedValue([
          { adapter: "claude", installed: true },
          { adapter: "codex", installed: true },
        ]),
      };
    }),
  } as never;
}

describe("agent orchestrator compat provider", () => {
  it("does not encourage task agents for direct calendar questions", async () => {
    const provider = orchestratorPlugin.providers?.find(
      (candidate) => candidate.name === "TASK_AGENT_EXAMPLES",
    );
    expect(provider).toBeDefined();

    const result = await provider?.get?.(
      createRuntime(),
      { content: { text: "when do i fly back from denver next week?" } } as never,
      {} as never,
    );

    expect(result?.text).toContain(
      "Do not use CREATE_TASK, SPAWN_AGENT, or SEND_TO_AGENT for normal LifeOps, calendar, Gmail, scheduling, or other questions the main agent can answer directly.",
    );
    expect(result?.text).not.toContain(
      "Use task agents for anything more complicated than a simple direct reply.",
    );
  });

  it("keeps active-workspace context quiet for direct calendar questions", async () => {
    const provider = orchestratorPlugin.providers?.find(
      (candidate) => candidate.name === "ACTIVE_WORKSPACE_CONTEXT",
    );
    expect(provider).toBeDefined();

    const result = await provider?.get?.(
      createRuntime(),
      { content: { text: "hey when do i fly back from denver" } } as never,
      {} as never,
    );

    expect(result?.text).toContain("No active workspaces or task-agent sessions.");
    expect(result?.text).toContain(
      "Ignore this provider for direct calendar, Gmail, LifeOps, or other normal assistant questions.",
    );
    expect(result?.text).not.toContain(
      "Use CREATE_TASK when the user needs anything more involved than a simple direct reply.",
    );
  });

  it("keeps detailed task-agent guidance for explicit repo work", async () => {
    const provider = orchestratorPlugin.providers?.find(
      (candidate) => candidate.name === "TASK_AGENT_EXAMPLES",
    );
    expect(provider).toBeDefined();

    const result = await provider?.get?.(
      createRuntime(),
      {
        content: {
          text: "Investigate why the production login flow started returning 401s in our repository and fix it.",
        },
      } as never,
      {} as never,
    );

    expect(result?.text).toContain("Examples:");
    expect(result?.text).toContain("<action>CREATE_TASK</action>");
  });
});
