import type { CodingAgentSession } from "@miladyai/app-core/api";
import { AgentActivityBox } from "@miladyai/app-core/components/AgentActivityBox";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it } from "vitest";

function makeSession(
  overrides: Partial<CodingAgentSession> = {},
): CodingAgentSession {
  return {
    sessionId: "s-1",
    label: "my-task",
    agentType: "claude",
    status: "active",
    decisionCount: 0,
    autoResolvedCount: 0,
    ...overrides,
  };
}

describe("AgentActivityBox", () => {
  it("renders nothing when no sessions", () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(AgentActivityBox, { sessions: [] }),
      );
    });
    expect(tree.toJSON()).toBeNull();
  });

  it("renders a row per session with label and activity", () => {
    const sessions = [
      makeSession({
        sessionId: "s-1",
        label: "task-a",
        lastActivity: "Running Write",
      }),
      makeSession({
        sessionId: "s-2",
        label: "task-b",
        status: "blocked",
        lastActivity: "Waiting for input",
      }),
    ];
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(AgentActivityBox, { sessions }),
      );
    });

    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain("task-a");
    expect(json).toContain("task-b");
    expect(json).toContain("Running Write");
    expect(json).toContain("Waiting for input");
  });

  it("derives activity from status when lastActivity is absent", () => {
    const sessions = [
      makeSession({ status: "tool_running", toolDescription: "Bash" }),
    ];
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        React.createElement(AgentActivityBox, { sessions }),
      );
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain("Running Bash");
  });

});
