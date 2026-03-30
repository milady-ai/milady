import type { CodingAgentSession } from "@miladyai/app-core/api";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

function testT(key: string, opts?: Record<string, unknown>): string {
  if (opts?.defaultValue && typeof opts.defaultValue === "string") {
    let str = opts.defaultValue;
    for (const [k, v] of Object.entries(opts)) {
      if (k !== "defaultValue") str = str.replace(`{{${k}}}`, String(v));
    }
    return str;
  }
  return key;
}

vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => ({ t: testT }),
}));

import { AgentActivityBox } from "../../src/components/AgentActivityBox";

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
