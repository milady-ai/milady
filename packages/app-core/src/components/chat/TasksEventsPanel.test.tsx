// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp, mockClient } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockClient: {
    getLifeOpsOverview: vi.fn(),
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
  usePtySessions: () => ({ ptySessions: [] }),
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
    mockClient.getLifeOpsOverview.mockReset();

    const overview = {
      occurrences: [
        {
          id: "owner-occurrence",
          agentId: "agent-1",
          domain: "user_lifeops",
          subjectType: "owner",
          subjectId: "owner-1",
          visibilityScope: "owner_agent_admin",
          contextPolicy: "explicit_only",
          definitionId: "definition-1",
          occurrenceKey: "definition-1:today",
          scheduledAt: "2026-04-04T16:00:00.000Z",
          dueAt: "2026-04-04T16:00:00.000Z",
          relevanceStartAt: "2026-04-04T15:30:00.000Z",
          relevanceEndAt: "2026-04-04T18:00:00.000Z",
          windowName: "afternoon",
          state: "visible",
          snoozedUntil: null,
          completionPayload: null,
          derivedTarget: null,
          metadata: {},
          createdAt: "2026-04-04T14:00:00.000Z",
          updatedAt: "2026-04-04T14:00:00.000Z",
          definitionKind: "habit",
          definitionStatus: "active",
          cadence: {
            kind: "times_per_day",
            slots: [
              {
                key: "morning",
                label: "Morning",
                minuteOfDay: 480,
                durationMinutes: 30,
              },
              {
                key: "evening",
                label: "Evening",
                minuteOfDay: 1080,
                durationMinutes: 30,
              },
            ],
          },
          title: "Take medication",
          description: "Morning and evening support task",
          priority: 1,
          timezone: "America/Los_Angeles",
          source: "manual",
          goalId: null,
        },
      ],
      goals: [
        {
          id: "owner-goal",
          agentId: "agent-1",
          domain: "user_lifeops",
          subjectType: "owner",
          subjectId: "owner-1",
          visibilityScope: "owner_agent_admin",
          contextPolicy: "explicit_only",
          title: "Sleep regularly",
          description: "Keep a consistent wind-down routine",
          cadence: null,
          supportStrategy: {},
          successCriteria: {},
          status: "active",
          reviewState: "on_track",
          metadata: {},
          createdAt: "2026-04-04T14:00:00.000Z",
          updatedAt: "2026-04-04T14:00:00.000Z",
        },
      ],
      reminders: [
        {
          domain: "user_lifeops",
          subjectType: "owner",
          subjectId: "owner-1",
          ownerType: "occurrence",
          ownerId: "owner-occurrence",
          occurrenceId: "owner-occurrence",
          definitionId: "definition-1",
          eventId: null,
          title: "Take medication",
          channel: "in_app",
          stepIndex: 0,
          stepLabel: "Check in now",
          scheduledFor: "2026-04-04T15:55:00.000Z",
          dueAt: "2026-04-04T16:00:00.000Z",
          state: "visible",
          htmlLink: null,
          eventStartAt: null,
        },
      ],
      summary: {
        activeOccurrenceCount: 1,
        overdueOccurrenceCount: 0,
        snoozedOccurrenceCount: 0,
        activeReminderCount: 1,
        activeGoalCount: 1,
      },
      owner: {
        occurrences: [
          {
            id: "owner-occurrence",
            agentId: "agent-1",
            domain: "user_lifeops",
            subjectType: "owner",
            subjectId: "owner-1",
            visibilityScope: "owner_agent_admin",
            contextPolicy: "explicit_only",
            definitionId: "definition-1",
            occurrenceKey: "definition-1:today",
            scheduledAt: "2026-04-04T16:00:00.000Z",
            dueAt: "2026-04-04T16:00:00.000Z",
            relevanceStartAt: "2026-04-04T15:30:00.000Z",
            relevanceEndAt: "2026-04-04T18:00:00.000Z",
            windowName: "afternoon",
            state: "visible",
            snoozedUntil: null,
            completionPayload: null,
            derivedTarget: null,
            metadata: {},
            createdAt: "2026-04-04T14:00:00.000Z",
            updatedAt: "2026-04-04T14:00:00.000Z",
            definitionKind: "habit",
            definitionStatus: "active",
            cadence: {
              kind: "times_per_day",
              slots: [
                {
                  key: "morning",
                  label: "Morning",
                  minuteOfDay: 480,
                  durationMinutes: 30,
                },
                {
                  key: "evening",
                  label: "Evening",
                  minuteOfDay: 1080,
                  durationMinutes: 30,
                },
              ],
            },
            title: "Take medication",
            description: "Morning and evening support task",
            priority: 1,
            timezone: "America/Los_Angeles",
            source: "manual",
            goalId: null,
          },
        ],
        goals: [
          {
            id: "owner-goal",
            agentId: "agent-1",
            domain: "user_lifeops",
            subjectType: "owner",
            subjectId: "owner-1",
            visibilityScope: "owner_agent_admin",
            contextPolicy: "explicit_only",
            title: "Sleep regularly",
            description: "Keep a consistent wind-down routine",
            cadence: null,
            supportStrategy: {},
            successCriteria: {},
            status: "active",
            reviewState: "on_track",
            metadata: {},
            createdAt: "2026-04-04T14:00:00.000Z",
            updatedAt: "2026-04-04T14:00:00.000Z",
          },
        ],
        reminders: [
          {
            domain: "user_lifeops",
            subjectType: "owner",
            subjectId: "owner-1",
            ownerType: "occurrence",
            ownerId: "owner-occurrence",
            occurrenceId: "owner-occurrence",
            definitionId: "definition-1",
            eventId: null,
            title: "Take medication",
            channel: "in_app",
            stepIndex: 0,
            stepLabel: "Check in now",
            scheduledFor: "2026-04-04T15:55:00.000Z",
            dueAt: "2026-04-04T16:00:00.000Z",
            state: "visible",
            htmlLink: null,
            eventStartAt: null,
          },
        ],
        summary: {
          activeOccurrenceCount: 1,
          overdueOccurrenceCount: 0,
          snoozedOccurrenceCount: 0,
          activeReminderCount: 1,
          activeGoalCount: 1,
        },
      },
      agentOps: {
        occurrences: [],
        goals: [
          {
            id: "agent-goal",
            agentId: "agent-1",
            domain: "agent_ops",
            subjectType: "agent",
            subjectId: "agent-1",
            visibilityScope: "agent_and_admin",
            contextPolicy: "never",
            title: "Keep the plugin bridge healthy",
            description: "Track agent-private operational goals",
            cadence: null,
            supportStrategy: {},
            successCriteria: {},
            status: "active",
            reviewState: "needs_attention",
            metadata: {},
            createdAt: "2026-04-04T14:00:00.000Z",
            updatedAt: "2026-04-04T14:00:00.000Z",
          },
        ],
        reminders: [],
        summary: {
          activeOccurrenceCount: 0,
          overdueOccurrenceCount: 0,
          snoozedOccurrenceCount: 0,
          activeReminderCount: 0,
          activeGoalCount: 1,
        },
      },
    };

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
      workbench: {
        todos: [],
        lifeops: overview,
      },
    });

    mockClient.getLifeOpsOverview.mockResolvedValue(overview);
  });

  it("shows owner life ops, agent ops, and live activity", async () => {
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

    const text = flattenText(tree.root)
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    expect(mockClient.getLifeOpsOverview).not.toHaveBeenCalled();
    expect(text).toContain("life ops");
    expect(text).toContain("take medication");
    expect(text).toContain("twice daily");
    expect(text).toContain("sleep regularly");
    expect(text).toContain("agent ops");
    expect(text).toContain("keep the plugin bridge healthy");
    expect(text).toContain("worker 1");
    expect(text).not.toContain("finished worker");
    expect(text).toContain("task started: worker 1");
    expect(text).toContain("activity");
    expect(text).toContain("reminders are driven from lifeops");
  });

  it("shows empty life ops/task states without inventing fake defaults", async () => {
    mockUseApp.mockReturnValue({
      ptySessions: [],
      t: (key: string, options?: { defaultValue?: string }) =>
        options?.defaultValue ?? key,
      workbench: {
        todos: [],
        lifeops: null,
      },
    });
    mockClient.getLifeOpsOverview.mockResolvedValue({
      occurrences: [],
      goals: [],
      reminders: [],
      summary: {
        activeOccurrenceCount: 0,
        overdueOccurrenceCount: 0,
        snoozedOccurrenceCount: 0,
        activeReminderCount: 0,
        activeGoalCount: 0,
      },
      owner: {
        occurrences: [],
        goals: [],
        reminders: [],
        summary: {
          activeOccurrenceCount: 0,
          overdueOccurrenceCount: 0,
          snoozedOccurrenceCount: 0,
          activeReminderCount: 0,
          activeGoalCount: 0,
        },
      },
      agentOps: {
        occurrences: [],
        goals: [],
        reminders: [],
        summary: {
          activeOccurrenceCount: 0,
          overdueOccurrenceCount: 0,
          snoozedOccurrenceCount: 0,
          activeReminderCount: 0,
          activeGoalCount: 0,
        },
      },
    });

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(TasksEventsPanel, {
          open: true,
          clearEvents: vi.fn(),
          events: [],
        }),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const text = flattenText(tree.root)
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    expect(text).toContain("no life ops yet");
    expect(text).toContain("no orchestrator work running");
    expect(text).toContain("no recent activity");
    expect(text).not.toContain("default todo");
    expect(text).not.toContain("plugin-todo");
  });

  it("falls back to hydrated workbench life ops if the refresh fails", async () => {
    mockUseApp.mockReturnValue({
      ptySessions: [],
      t: (key: string, options?: { defaultValue?: string }) =>
        options?.defaultValue ?? key,
      workbench: {
        todos: [],
        lifeops: {
          occurrences: [
            {
              id: "fallback-occurrence",
              agentId: "agent-1",
              domain: "user_lifeops",
              subjectType: "owner",
              subjectId: "owner-1",
              visibilityScope: "owner_agent_admin",
              contextPolicy: "explicit_only",
              definitionId: "definition-fallback",
              occurrenceKey: "definition-fallback:today",
              scheduledAt: "2026-04-04T16:00:00.000Z",
              dueAt: "2026-04-04T16:00:00.000Z",
              relevanceStartAt: "2026-04-04T15:30:00.000Z",
              relevanceEndAt: "2026-04-04T18:00:00.000Z",
              windowName: "afternoon",
              state: "visible",
              snoozedUntil: null,
              completionPayload: null,
              derivedTarget: null,
              metadata: {},
              createdAt: "2026-04-04T14:00:00.000Z",
              updatedAt: "2026-04-04T14:00:00.000Z",
              definitionKind: "task",
              definitionStatus: "active",
              cadence: { kind: "once", dueAt: "2026-04-04T16:00:00.000Z" },
              title: "Follow up on plugin wiring",
              description: "Hydrated from the workbench snapshot",
              priority: 2,
              timezone: "America/Los_Angeles",
              source: "manual",
              goalId: null,
            },
          ],
          goals: [],
          reminders: [],
          summary: {
            activeOccurrenceCount: 1,
            overdueOccurrenceCount: 0,
            snoozedOccurrenceCount: 0,
            activeReminderCount: 0,
            activeGoalCount: 0,
          },
          owner: {
            occurrences: [
              {
                id: "fallback-occurrence",
                agentId: "agent-1",
                domain: "user_lifeops",
                subjectType: "owner",
                subjectId: "owner-1",
                visibilityScope: "owner_agent_admin",
                contextPolicy: "explicit_only",
                definitionId: "definition-fallback",
                occurrenceKey: "definition-fallback:today",
                scheduledAt: "2026-04-04T16:00:00.000Z",
                dueAt: "2026-04-04T16:00:00.000Z",
                relevanceStartAt: "2026-04-04T15:30:00.000Z",
                relevanceEndAt: "2026-04-04T18:00:00.000Z",
                windowName: "afternoon",
                state: "visible",
                snoozedUntil: null,
                completionPayload: null,
                derivedTarget: null,
                metadata: {},
                createdAt: "2026-04-04T14:00:00.000Z",
                updatedAt: "2026-04-04T14:00:00.000Z",
                definitionKind: "task",
                definitionStatus: "active",
                cadence: { kind: "once", dueAt: "2026-04-04T16:00:00.000Z" },
                title: "Follow up on plugin wiring",
                description: "Hydrated from the workbench snapshot",
                priority: 2,
                timezone: "America/Los_Angeles",
                source: "manual",
                goalId: null,
              },
            ],
            goals: [],
            reminders: [],
            summary: {
              activeOccurrenceCount: 1,
              overdueOccurrenceCount: 0,
              snoozedOccurrenceCount: 0,
              activeReminderCount: 0,
              activeGoalCount: 0,
            },
          },
          agentOps: {
            occurrences: [],
            goals: [],
            reminders: [],
            summary: {
              activeOccurrenceCount: 0,
              overdueOccurrenceCount: 0,
              snoozedOccurrenceCount: 0,
              activeReminderCount: 0,
              activeGoalCount: 0,
            },
          },
        },
      },
    });
    mockClient.getLifeOpsOverview.mockRejectedValue(new Error("network"));

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(TasksEventsPanel, {
          open: true,
          clearEvents: vi.fn(),
          events: [],
        }),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const text = flattenText(tree.root)
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    expect(text).toContain("follow up on plugin wiring");
    expect(text).toContain("one-off");
  });

  it("clears activity entries from the panel", async () => {
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
              eventType: "tool_running",
              summary: "Running bun test",
            },
          ],
        }),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const clearButton = tree.root
      .findAllByType("button")
      .find((button) => flattenText(button).includes("Clear"));
    expect(clearButton).toBeDefined();

    await act(async () => {
      clearButton?.props.onClick();
    });

    expect(clearEvents).toHaveBeenCalledTimes(1);
  });
});
