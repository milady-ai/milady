// @vitest-environment jsdom

import type { LifeOpsOverview } from "@miladyai/shared/contracts/lifeops";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flush, text } from "../../../../../test/helpers/react-test";
import { LIFEOPS_GITHUB_POST_MESSAGE_TYPE } from "../../platform";

const { mockClient, mockOpenExternalUrl, mockUseApp, mockPopupClose } =
  vi.hoisted(() => ({
    mockClient: {
      createCloudCompatAgentManagedGithubOauth: vi.fn(),
      disconnectCloudCompatAgentManagedGithub: vi.fn(),
      disconnectCloudOauthConnection: vi.fn(),
      getCloudCompatAgentManagedGithub: vi.fn(),
      getCloudCompatAgents: vi.fn(),
      getLifeOpsOverview: vi.fn(),
      initiateCloudOauth: vi.fn(),
      linkCloudCompatAgentManagedGithub: vi.fn(),
      listCloudOauthConnections: vi.fn(),
    },
    mockOpenExternalUrl: vi.fn(),
    mockUseApp: vi.fn(),
    mockPopupClose: vi.fn(),
  }));

const mockPopup = {
  location: { href: "" },
  close: mockPopupClose,
  closed: false,
} as unknown as Window;
let previousWindow: Window | undefined;

vi.mock("../../api", () => ({
  client: mockClient,
}));

vi.mock("../../state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../utils", () => ({
  openExternalUrl: mockOpenExternalUrl,
}));

vi.mock("./LifeOpsWorkspaceView", () => ({
  LifeOpsWorkspaceView: () =>
    React.createElement(
      "div",
      { "data-testid": "lifeops-workspace-stub" },
      "workspace",
    ),
}));

vi.mock("../settings/LifeOpsSettingsSection", () => ({
  LifeOpsSettingsSection: () =>
    React.createElement(
      "div",
      { "data-testid": "lifeops-settings-stub" },
      "lifeops-settings",
    ),
}));

vi.mock("@miladyai/ui", () => {
  const passthrough = ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement("div", props, children);

  return {
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
    PagePanel: Object.assign(passthrough, {
      Empty: ({
        title,
        description,
        ...props
      }: React.PropsWithChildren<
        { title?: string; description?: string } & Record<string, unknown>
      >) =>
        React.createElement(
          "div",
          props,
          React.createElement("div", null, title),
          description ? React.createElement("div", null, description) : null,
        ),
      Header: ({
        heading,
        description,
        eyebrow,
        actions,
      }: React.PropsWithChildren<{
        heading?: string;
        description?: string;
        eyebrow?: string;
        actions?: React.ReactNode;
      }>) =>
        React.createElement(
          "div",
          null,
          eyebrow ? React.createElement("div", null, eyebrow) : null,
          heading ? React.createElement("div", null, heading) : null,
          description ? React.createElement("div", null, description) : null,
          actions ?? null,
        ),
      Loading: ({ heading }: { heading?: string }) =>
        React.createElement("div", null, heading ?? "Loading"),
      Notice: ({
        children,
      }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement("div", null, children),
    }),
  };
});

import { LifeOpsPageView } from "./LifeOpsPageView";

function createOverview(): LifeOpsOverview {
  return {
    occurrences: [],
    goals: [],
    reminders: [],
    summary: {
      activeOccurrenceCount: 3,
      overdueOccurrenceCount: 1,
      snoozedOccurrenceCount: 1,
      activeReminderCount: 2,
      activeGoalCount: 2,
    },
    owner: {
      occurrences: [
        {
          id: "occ-1",
          agentId: "agent-1",
          domain: "user_lifeops",
          subjectType: "self",
          subjectId: "owner",
          visibilityScope: "private",
          contextPolicy: "owner_agent_only",
          definitionId: "def-1",
          occurrenceKey: "occ-1",
          scheduledAt: null,
          dueAt: "2026-04-10T16:00:00.000Z",
          relevanceStartAt: "2026-04-10T15:30:00.000Z",
          relevanceEndAt: "2026-04-10T17:00:00.000Z",
          windowName: "afternoon",
          state: "visible",
          snoozedUntil: null,
          completionPayload: null,
          derivedTarget: null,
          metadata: {},
          createdAt: "2026-04-10T14:00:00.000Z",
          updatedAt: "2026-04-10T14:00:00.000Z",
          definitionKind: "habit",
          definitionStatus: "active",
          cadence: { kind: "daily", windows: ["afternoon"] },
          title: "Brush teeth",
          description: "Keep the cadence consistent.",
          priority: 2,
          timezone: "America/Los_Angeles",
          source: "life",
          goalId: null,
        },
      ],
      goals: [
        {
          id: "goal-1",
          agentId: "agent-1",
          domain: "user_lifeops",
          subjectType: "self",
          subjectId: "owner",
          visibilityScope: "private",
          contextPolicy: "owner_agent_only",
          title: "Sleep better",
          description: "Keep a stable bedtime.",
          cadence: null,
          supportStrategy: {},
          successCriteria: {},
          status: "active",
          reviewState: "on_track",
          metadata: {},
          createdAt: "2026-04-09T12:00:00.000Z",
          updatedAt: "2026-04-10T12:00:00.000Z",
        },
      ],
      reminders: [
        {
          domain: "user_lifeops",
          subjectType: "self",
          subjectId: "owner",
          ownerType: "occurrence",
          ownerId: "occ-1",
          occurrenceId: "occ-1",
          definitionId: "def-1",
          eventId: null,
          title: "Brush teeth",
          channel: "chat",
          stepIndex: 0,
          stepLabel: "Nudge",
          scheduledFor: "2026-04-10T15:45:00.000Z",
          dueAt: "2026-04-10T16:00:00.000Z",
          state: "visible",
        },
      ],
      summary: {
        activeOccurrenceCount: 3,
        overdueOccurrenceCount: 1,
        snoozedOccurrenceCount: 1,
        activeReminderCount: 2,
        activeGoalCount: 2,
      },
    },
    agentOps: {
      occurrences: [
        {
          id: "occ-agent-1",
          agentId: "agent-1",
          domain: "agent_ops",
          subjectType: "agent",
          subjectId: "agent-1",
          visibilityScope: "private",
          contextPolicy: "owner_agent_only",
          definitionId: "def-agent-1",
          occurrenceKey: "occ-agent-1",
          scheduledAt: "2026-04-10T18:00:00.000Z",
          dueAt: null,
          relevanceStartAt: "2026-04-10T18:00:00.000Z",
          relevanceEndAt: "2026-04-10T19:00:00.000Z",
          windowName: "evening",
          state: "scheduled",
          snoozedUntil: null,
          completionPayload: null,
          derivedTarget: null,
          metadata: {},
          createdAt: "2026-04-10T14:00:00.000Z",
          updatedAt: "2026-04-10T14:00:00.000Z",
          definitionKind: "workflow",
          definitionStatus: "active",
          cadence: { kind: "once", dueAt: "2026-04-10T18:00:00.000Z" },
          title: "Review day plan",
          description: "Check tomorrow's schedule.",
          priority: 1,
          timezone: "America/Los_Angeles",
          source: "life",
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
  } as LifeOpsOverview;
}

function findButton(
  root: TestRenderer.ReactTestInstance,
  label: string,
): TestRenderer.ReactTestInstance {
  const match = root.findAll(
    (node) => node.type === "button" && text(node).includes(label),
  )[0];
  if (!match) {
    throw new Error(`Button "${label}" not found`);
  }
  return match;
}

function hasText(root: TestRenderer.ReactTestInstance, value: string): boolean {
  return root.findAll((node) => text(node).includes(value)).length > 0;
}

describe("LifeOpsPageView", () => {
  const setActionNotice = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    previousWindow = (globalThis as typeof globalThis & { window?: Window })
      .window;
    Object.defineProperty(globalThis, "window", {
      value: new EventTarget(),
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, "open", {
      value: () => null,
      configurable: true,
      writable: true,
    });
    mockClient.createCloudCompatAgentManagedGithubOauth.mockReset();
    mockClient.disconnectCloudCompatAgentManagedGithub.mockReset();
    mockClient.disconnectCloudOauthConnection.mockReset();
    mockClient.getCloudCompatAgentManagedGithub.mockReset();
    mockClient.getCloudCompatAgents.mockReset();
    mockClient.getLifeOpsOverview.mockReset();
    mockClient.initiateCloudOauth.mockReset();
    mockClient.linkCloudCompatAgentManagedGithub.mockReset();
    mockClient.listCloudOauthConnections.mockReset();
    mockOpenExternalUrl.mockReset();
    mockUseApp.mockReset();
    setActionNotice.mockReset();
    mockPopupClose.mockReset();
    mockPopup.location.href = "";
    vi.spyOn(window, "open").mockReturnValue(mockPopup);

    mockUseApp.mockReturnValue({
      agentStatus: { state: "running" },
      backendConnection: { state: "connected" },
      elizaCloudConnected: true,
      setActionNotice,
      setState: vi.fn(),
      setTab: vi.fn(),
      startupCoordinator: { phase: "ready" },
    });

    mockClient.getLifeOpsOverview.mockResolvedValue(createOverview());
    mockClient.listCloudOauthConnections.mockResolvedValue({
      connections: [
        {
          id: "owner-gh-1",
          connectionRole: "owner",
          platform: "github",
          platformUserId: "123",
          username: "lifeops-owner",
          displayName: "LifeOps Owner",
          email: "owner@example.com",
          status: "active",
          scopes: ["repo", "read:user"],
          linkedAt: "2026-04-10T12:00:00.000Z",
          tokenExpired: false,
          source: "platform_credentials",
        },
      ],
    });
    mockClient.getCloudCompatAgents.mockResolvedValue({
      success: true,
      data: [
        {
          agent_id: "agent-1",
          agent_name: "Milady Cloud",
          node_id: null,
          container_id: null,
          headscale_ip: null,
          bridge_url: null,
          web_ui_url: null,
          status: "running",
          agent_config: {},
          created_at: "2026-04-10T12:00:00.000Z",
          updated_at: "2026-04-10T12:00:00.000Z",
          containerUrl: "",
          webUiUrl: null,
          database_status: "ready",
          error_message: null,
          last_heartbeat_at: "2026-04-10T12:10:00.000Z",
        },
      ],
    });
    mockClient.getCloudCompatAgentManagedGithub.mockResolvedValue({
      success: true,
      data: {
        configured: true,
        connected: true,
        mode: "cloud-managed",
        connectionId: "agent-gh-1",
        connectionRole: "agent",
        githubUserId: "456",
        githubUsername: "agent-runner",
        githubDisplayName: "Agent Runner",
        githubAvatarUrl: null,
        githubEmail: "agent@example.com",
        scopes: ["repo"],
        source: "platform_credentials",
        adminElizaUserId: "user-1",
        connectedAt: "2026-04-10T12:05:00.000Z",
      },
    });
    mockClient.initiateCloudOauth.mockResolvedValue({
      authUrl: "https://example.com/github-owner",
    });
    mockClient.createCloudCompatAgentManagedGithubOauth.mockResolvedValue({
      success: true,
      data: {
        authorizeUrl: "https://example.com/github-agent",
      },
    });
    mockClient.linkCloudCompatAgentManagedGithub.mockResolvedValue({
      success: true,
      data: {
        configured: true,
        connected: true,
        mode: "shared-owner",
        connectionId: "owner-gh-1",
        connectionRole: "owner",
        githubUserId: "123",
        githubUsername: "lifeops-owner",
        githubDisplayName: "LifeOps Owner",
        githubAvatarUrl: null,
        githubEmail: "owner@example.com",
        scopes: ["repo", "read:user"],
        source: "platform_credentials",
        adminElizaUserId: "user-1",
        connectedAt: "2026-04-10T12:20:00.000Z",
        restarted: true,
      },
    });
  });

  afterEach(() => {
    if (previousWindow) {
      Object.defineProperty(globalThis, "window", {
        value: previousWindow,
        configurable: true,
        writable: true,
      });
      return;
    }
    Reflect.deleteProperty(globalThis, "window");
  });

  it("renders overview, owner GitHub, and agent GitHub surfaces", async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(LifeOpsPageView));
      await flush();
    });

    const root = renderer!.root;
    expect(hasText(root, "Personal Operations")).toBe(true);
    expect(hasText(root, "Brush teeth")).toBe(true);
    expect(hasText(root, "LifeOps Owner")).toBe(true);
    expect(hasText(root, "Milady Cloud")).toBe(true);
    expect(hasText(root, "lifeops-settings")).toBe(true);
    expect(hasText(root, "workspace")).toBe(true);
  });

  it("starts the owner GitHub OAuth flow through Eliza Cloud", async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(LifeOpsPageView));
      await flush();
    });

    await act(async () => {
      findButton(renderer!.root, "Reconnect / add account").props.onClick();
      await flush();
    });

    expect(mockClient.initiateCloudOauth).toHaveBeenCalledWith("github", {
      redirectUrl: "/api/v1/milady/lifeops/github-complete?post_message=1",
      connectionRole: "owner",
    });
    expect(window.open).toHaveBeenCalledWith("", "milady-lifeops-github");
    expect(mockPopup.location.href).toBe("https://example.com/github-owner");
    expect(mockOpenExternalUrl).not.toHaveBeenCalled();
  });

  it("starts the managed agent GitHub OAuth flow", async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(LifeOpsPageView));
      await flush();
    });

    await act(async () => {
      findButton(renderer!.root, "Reconnect agent GitHub").props.onClick();
      await flush();
    });

    expect(
      mockClient.createCloudCompatAgentManagedGithubOauth,
    ).toHaveBeenCalledWith("agent-1", { postMessage: true });
    expect(mockPopup.location.href).toBe("https://example.com/github-agent");
    expect(mockOpenExternalUrl).not.toHaveBeenCalled();
  });

  it("can link an owner LifeOps GitHub connection to an agent", async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(LifeOpsPageView));
      await flush();
    });

    await act(async () => {
      findButton(renderer!.root, "Use @lifeops-owner").props.onClick();
      await flush();
    });

    expect(mockClient.linkCloudCompatAgentManagedGithub).toHaveBeenCalledWith(
      "agent-1",
      "owner-gh-1",
    );
    expect(setActionNotice).toHaveBeenCalledWith(
      "Agent is using the LifeOps GitHub account and the cloud runtime is restarting.",
      "success",
      4200,
    );
  });

  it("refreshes GitHub state after a popup completion message", async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(LifeOpsPageView));
      await flush();
    });

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: LIFEOPS_GITHUB_POST_MESSAGE_TYPE,
            target: "agent",
            status: "connected",
            agentId: "agent-1",
            githubUsername: "agent-runner",
            bindingMode: "shared-owner",
            restarted: true,
          },
        }),
      );
      await flush();
    });

    expect(setActionNotice).toHaveBeenCalledWith(
      "Agent is using the LifeOps GitHub account and the cloud runtime is restarting.",
      "success",
      4200,
    );
    // Initial mount + at least one refresh after the popup message
    expect(
      mockClient.listCloudOauthConnections.mock.calls.length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("shows a cloud connection prompt when Eliza Cloud is disconnected", async () => {
    mockUseApp.mockReturnValue({
      agentStatus: { state: "running" },
      backendConnection: { state: "connected" },
      elizaCloudConnected: false,
      setActionNotice: vi.fn(),
      setState: vi.fn(),
      setTab: vi.fn(),
      startupCoordinator: { phase: "ready" },
    });

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(LifeOpsPageView));
      await flush();
    });

    expect(hasText(renderer!.root, "Connect Eliza Cloud first")).toBe(true);
    expect(mockClient.listCloudOauthConnections).not.toHaveBeenCalled();
  });
});
