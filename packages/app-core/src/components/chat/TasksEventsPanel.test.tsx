// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp, mockClient } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockClient: {
    listWorkbenchTodos: vi.fn(),
  },
}));

vi.mock("@miladyai/ui", () => ({
  Badge: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement("span", props, children),
  Button: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement("button", { type: "button", ...props }, children),
}));

vi.mock("../../state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../api", () => ({
  client: mockClient,
}));

import { TasksEventsPanel } from "./TasksEventsPanel";

function flattenText(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => {
      if (typeof child === "string") {
        return child;
      }
      return flattenText(child);
    })
    .join(" ");
}

describe("TasksEventsPanel", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockClient.listWorkbenchTodos.mockReset();
    mockUseApp.mockReturnValue({
      ptySessions: [
        {
          sessionId: "active-1",
          agentType: "codex",
          label: "Worker 1",
          originalTask: "Investigate failing tests",
          workdir: "/tmp/worker-1",
          status: "tool_running",
          decisionCount: 0,
          autoResolvedCount: 0,
          toolDescription: "bun test",
          lastActivity: "Running bun test",
        },
        {
          sessionId: "done-1",
          agentType: "codex",
          label: "Finished worker",
          originalTask: "Already done",
          workdir: "/tmp/worker-done",
          status: "completed",
          decisionCount: 0,
          autoResolvedCount: 0,
        },
      ],
      t: (key: string, options?: { defaultValue?: string }) =>
        options?.defaultValue ?? key,
      workbench: { todos: [] },
    });
    mockClient.listWorkbenchTodos.mockResolvedValue({
      todos: [
        {
          id: "todo-open",
          name: "Write release notes",
          description: "Summarize the widget bar change",
          priority: 1,
          isUrgent: true,
          isCompleted: false,
          type: "task",
        },
        {
          id: "todo-done",
          name: "Ship patch",
          description: "Already done",
          priority: null,
          isUrgent: false,
          isCompleted: true,
          type: "task",
        },
      ],
    });
  });

  it("shows open todos, ongoing orchestrator sessions, and recent events", async () => {
    const clearEvents = vi.fn();

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(TasksEventsPanel, {
          open: true,
          clearEvents,
          events: [
            {
              id: "evt-1",
              timestamp: Date.now(),
              eventType: "task_registered",
              summary: "Task started: Worker 1",
            },
          ],
        }),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const text = flattenText(tree.root).toLowerCase();
    expect(mockClient.listWorkbenchTodos.mock.calls.length).toBeGreaterThan(0);
    expect(text).toContain("write release notes");
    expect(text).not.toContain("ship patch");
    expect(text).toContain("worker 1");
    expect(text).not.toContain("finished worker");
    expect(text).toContain("task started: worker 1");
  });
});
