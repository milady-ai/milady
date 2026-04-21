// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp, mockClient } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockClient: {
    getLifeOpsOverview: vi.fn(),
    completeLifeOpsOccurrence: vi.fn(),
    snoozeLifeOpsOccurrence: vi.fn(),
    skipLifeOpsOccurrence: vi.fn(),
    getLifeOpsOccurrenceExplanation: vi.fn(),
    reviewLifeOpsGoal: vi.fn(),
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

vi.mock("../../../../api", () => ({
  client: mockClient,
}));

vi.mock("../../../../state", () => ({
  useApp: () => mockUseApp(),
}));

import { LifeOpsOverviewSidebarWidget } from "./lifeops-overview";

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

function createOverview() {
  return {
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
    goals: [],
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
      activeGoalCount: 0,
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
      goals: [],
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
        activeGoalCount: 0,
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
          title: "Keep plugin mirrors healthy",
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
}

describe("LifeOpsOverviewSidebarWidget", () => {
  beforeEach(() => {
    const overview = createOverview();
    mockUseApp.mockReset();
    mockClient.getLifeOpsOverview.mockReset();
    mockClient.completeLifeOpsOccurrence.mockReset();
    mockClient.snoozeLifeOpsOccurrence.mockReset();
    mockClient.skipLifeOpsOccurrence.mockReset();
    mockClient.getLifeOpsOccurrenceExplanation.mockReset();
    mockClient.reviewLifeOpsGoal.mockReset();

    mockUseApp.mockReturnValue({
      startupPhase: "ready",
      agentStatus: { state: "running" },
      backendConnection: { state: "connected" },
      workbench: {
        lifeops: overview,
      },
    });
    mockClient.getLifeOpsOverview.mockResolvedValue(overview);
    mockClient.getLifeOpsOccurrenceExplanation.mockResolvedValue({
      occurrence: overview.owner.occurrences[0],
      definition: {
        id: "definition-1",
        originalIntent: "remind me to take medication morning and evening",
        source: "chat",
      },
      definitionPerformance: {
        lastCompletedAt: "2026-04-04T16:01:00.000Z",
        lastSkippedAt: null,
        lastActivityAt: "2026-04-04T16:01:00.000Z",
        totalScheduledCount: 5,
        totalCompletedCount: 4,
        totalSkippedCount: 1,
        totalPendingCount: 0,
        currentOccurrenceStreak: 2,
        bestOccurrenceStreak: 3,
        currentPerfectDayStreak: 1,
        bestPerfectDayStreak: 2,
        last7Days: {
          scheduledCount: 5,
          completedCount: 4,
          skippedCount: 1,
          pendingCount: 0,
          completionRate: 0.8,
          perfectDayCount: 2,
        },
        last30Days: {
          scheduledCount: 12,
          completedCount: 10,
          skippedCount: 2,
          pendingCount: 0,
          completionRate: 10 / 12,
          perfectDayCount: 5,
        },
      },
      reminderPlan: {
        id: "plan-1",
        steps: [{ channel: "in_app", label: "Check in now", offsetMinutes: 5 }],
      },
      linkedGoal: null,
      reminderInspection: {
        ownerType: "occurrence",
        ownerId: "owner-occurrence",
        reminderPlan: null,
        attempts: [],
        audits: [],
      },
      definitionAudits: [],
      summary: {
        originalIntent: "remind me to take medication morning and evening",
        source: "chat",
        whyVisible:
          "This item is visible because it is due at 2026-04-04T16:00:00.000Z and its current relevance window started at 2026-04-04T15:30:00.000Z.",
        lastReminderAt: null,
        lastReminderChannel: null,
        lastReminderOutcome: null,
        lastActionSummary: null,
      },
    });
    mockClient.reviewLifeOpsGoal.mockResolvedValue({
      goal: {
        ...overview.agentOps.goals[0],
        reviewState: "on_track",
      },
      links: [],
      linkedDefinitions: [],
      activeOccurrences: [],
      overdueOccurrences: [],
      recentCompletions: [],
      suggestions: [
        {
          kind: "review_progress",
          title: "Check bridge status",
          detail: "Review progress.",
          definitionId: null,
          occurrenceId: null,
        },
      ],
      audits: [],
      summary: {
        linkedDefinitionCount: 0,
        activeOccurrenceCount: 0,
        overdueOccurrenceCount: 0,
        completedLast7Days: 0,
        lastActivityAt: null,
        reviewState: "on_track",
        explanation:
          "This goal is on track because 2 linked support items were completed in the last 7 days.",
      },
    });
  });

  it("renders now, goals, and agent ops sections", async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(LifeOpsOverviewSidebarWidget, {
          events: [],
          clearEvents: () => {},
        }),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const text = flattenText(renderer.root).toLowerCase();
    expect(text).toContain("life ops");
    expect(text).toContain("now");
    expect(text).toContain("take medication");
    expect(text).toContain("twice daily");
    expect(text).toContain("goals");
    expect(text).toContain("agent ops");
    expect(text).toContain("keep plugin mirrors healthy");
    expect(text).toContain("reminders are driven from lifeops");
  });

  it("does not request overview while the runtime is still starting", async () => {
    mockUseApp.mockReturnValue({
      startupPhase: "starting-backend",
      agentStatus: { state: "starting" },
      backendConnection: { state: "reconnecting" },
      workbench: {
        lifeops: createOverview(),
      },
    });

    await act(async () => {
      TestRenderer.create(
        React.createElement(LifeOpsOverviewSidebarWidget, {
          events: [],
          clearEvents: () => {},
        }),
      );
      await Promise.resolve();
    });

    expect(mockClient.getLifeOpsOverview).not.toHaveBeenCalled();
  });

  it("runs occurrence completion and refreshes the overview", async () => {
    const updatedOverview = createOverview();
    updatedOverview.owner.occurrences = [];
    updatedOverview.owner.reminders = [];
    updatedOverview.owner.summary.activeOccurrenceCount = 0;
    updatedOverview.owner.summary.activeReminderCount = 0;

    mockClient.getLifeOpsOverview
      .mockResolvedValueOnce(createOverview())
      .mockResolvedValueOnce(updatedOverview);
    mockClient.completeLifeOpsOccurrence.mockResolvedValue({
      occurrence: {
        ...createOverview().owner.occurrences[0],
        state: "completed",
      },
    });

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(LifeOpsOverviewSidebarWidget, {
          events: [],
          clearEvents: () => {},
        }),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const doneButton = renderer.root
      .findAllByType("button")
      .find((button) => flattenText(button).includes("Done"));
    expect(doneButton).toBeDefined();

    await act(async () => {
      doneButton?.props.onClick();
      await Promise.resolve();
    });

    expect(mockClient.completeLifeOpsOccurrence).toHaveBeenCalledWith(
      "owner-occurrence",
      {},
    );
    expect(
      mockClient.getLifeOpsOverview.mock.calls.length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("loads occurrence explanations and goal reviews on demand", async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(LifeOpsOverviewSidebarWidget, {
          events: [],
          clearEvents: () => {},
        }),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const explainButton = renderer.root
      .findAllByType("button")
      .find((button) => flattenText(button).includes("Why this?"));
    expect(explainButton).toBeDefined();

    await act(async () => {
      explainButton?.props.onClick();
      await Promise.resolve();
    });

    expect(mockClient.getLifeOpsOccurrenceExplanation).toHaveBeenCalledWith(
      "owner-occurrence",
    );
    const explanationText = flattenText(renderer.root)
      .toLowerCase()
      .replace(/\s+/g, " ");
    expect(explanationText).toContain("original intent");
    expect(explanationText).toContain("performance");
    expect(explanationText).toContain("4 / 5 completed overall");
    expect(explanationText).toContain("80% completion across 5 scheduled item");

    const reviewButton = renderer.root
      .findAllByType("button")
      .find((button) => flattenText(button).includes("Review"));
    expect(reviewButton).toBeDefined();

    await act(async () => {
      reviewButton?.props.onClick();
      await Promise.resolve();
    });

    expect(mockClient.reviewLifeOpsGoal).toHaveBeenCalledWith("agent-goal");
    expect(flattenText(renderer.root).toLowerCase()).toContain("goal review");
  });
});
