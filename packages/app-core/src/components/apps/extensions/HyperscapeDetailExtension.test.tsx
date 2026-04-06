// @vitest-environment jsdom

import type { AppRunSummary, RegistryAppInfo } from "../../../api";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { textOf } from "../../../../../../test/helpers/react-test";

const mockUseApp = vi.hoisted(() => vi.fn());
const mockClient = vi.hoisted(() => ({
  listHyperscapeEmbeddedAgents: vi.fn(),
  getHyperscapeAgentGoal: vi.fn(),
  getHyperscapeAgentQuickActions: vi.fn(),
  sendHyperscapeAgentMessage: vi.fn(),
  sendHyperscapeEmbeddedAgentCommand: vi.fn(),
  controlHyperscapeEmbeddedAgent: vi.fn(),
  controlAppSession: vi.fn(),
}));

vi.mock("../../../state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../../api", () => ({
  client: mockClient,
}));

import { HyperscapeDetailExtension } from "./HyperscapeDetailExtension";

function createApp(overrides: Partial<RegistryAppInfo> = {}): RegistryAppInfo {
  return {
    name: "@elizaos/app-hyperscape",
    displayName: "Hyperscape",
    description: "Embedded live agent control surface.",
    category: "game",
    launchType: "connect",
    launchUrl: "https://hyperscape.gg",
    icon: null,
    capabilities: ["combat"],
    stars: 1,
    repository: "https://github.com/example/hyperscape",
    latestVersion: "1.0.0",
    supports: { v0: false, v1: false, v2: true },
    npm: {
      package: "@elizaos/app-hyperscape",
      v0Version: null,
      v1Version: null,
      v2Version: "1.0.0",
    },
    uiExtension: {
      detailPanelId: "hyperscape-embedded-agent-control",
    },
    ...overrides,
  };
}

function createRun(overrides: Partial<AppRunSummary> = {}): AppRunSummary {
  return {
    runId: "run-hyperscape-1",
    appName: "@elizaos/app-hyperscape",
    displayName: "Hyperscape",
    pluginName: "@elizaos/app-hyperscape",
    launchType: "connect",
    launchUrl: "https://hyperscape.gg",
    viewer: {
      url: "https://hyperscape.gg",
      embedParams: {
        embedded: "true",
        mode: "spectator",
        surface: "agent-control",
        followEntity: "character-1",
      },
      postMessageAuth: true,
      sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
    },
    session: {
      sessionId: "hyperscape-session",
      appName: "@elizaos/app-hyperscape",
      mode: "spectate-and-steer",
      status: "running",
      displayName: "Hyperscape",
      agentId: "agent-1",
      characterId: "character-1",
      followEntity: "character-1",
      canSendCommands: true,
      controls: ["pause", "resume"],
      summary: "The embedded agent is patrolling the southern ridge.",
      goalLabel: "Scout the woodland path",
      suggestedPrompts: ["stay near the ridge", "avoid combat unless needed"],
      telemetry: {
        recentActivity: [
          {
            action: "patrol",
            detail: "Reached the southern ridge.",
            ts: "2026-04-06T00:00:10.000Z",
          },
        ],
      },
    },
    status: "running",
    summary: "The embedded agent is patrolling the southern ridge.",
    startedAt: "2026-04-06T00:00:00.000Z",
    updatedAt: "2026-04-06T00:00:10.000Z",
    lastHeartbeatAt: "2026-04-06T00:00:10.000Z",
    supportsBackground: true,
    viewerAttachment: "attached",
    health: {
      state: "healthy",
      message: "The embedded agent is patrolling the southern ridge.",
    },
    ...overrides,
  };
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("HyperscapeDetailExtension", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    Object.values(mockClient).forEach((mockFn) => mockFn.mockReset());
  });

  it("shows the embedded control fallback before a run exists", () => {
    mockUseApp.mockReturnValue({
      appRuns: [],
    });

    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <HyperscapeDetailExtension app={createApp()} />,
      );
    });

    const output = textOf(tree.root);
    expect(output).toContain("Hyperscape embedded control");
    expect(output).toContain("Launch Hyperscape");
  });

  it("renders live embedded-agent telemetry and steering actions", async () => {
    mockUseApp.mockReturnValue({
      appRuns: [createRun()],
    });

    mockClient.listHyperscapeEmbeddedAgents.mockResolvedValue({
      success: true,
      count: 1,
      agents: [
        {
          agentId: "agent-1",
          characterId: "character-1",
          accountId: "account-1",
          name: "Scout",
          scriptedRole: "balanced",
          state: "running",
          entityId: "entity-1",
          position: [12, 4, 8],
          health: 48,
          maxHealth: 60,
          startedAt: 1712361600000,
          lastActivity: 1712361660000,
          error: null,
        },
      ],
    });
    mockClient.getHyperscapeAgentGoal.mockResolvedValue({
      success: true,
      goal: {
        type: "scout",
        description: "Scout the woodland path",
        progressPercent: 45,
        locked: false,
      },
      availableGoals: [
        {
          id: "goal-1",
          type: "scout",
          description: "Scout the woodland path",
          priority: 10,
        },
      ],
      goalsPaused: false,
    });
    mockClient.getHyperscapeAgentQuickActions.mockResolvedValue({
      success: true,
      nearbyLocations: [
        { id: "loc-1", name: "Woodland Path", type: "trail", distance: 14 },
      ],
      availableGoals: [
        {
          id: "goal-1",
          type: "scout",
          description: "Scout the woodland path",
          priority: 10,
        },
      ],
      quickCommands: [
        {
          id: "cmd-1",
          label: "Scout ridge",
          command: "scout ridge",
          icon: "🧭",
          available: true,
        },
      ],
      inventory: [
        {
          id: "item-1",
          name: "Bronze sword",
          slot: 0,
          quantity: 1,
          canEquip: true,
          canUse: false,
          canDrop: true,
        },
      ],
      playerPosition: [12, 4, 8],
    });
    mockClient.sendHyperscapeAgentMessage.mockResolvedValue({
      success: true,
      message: "Queued",
    });
    mockClient.sendHyperscapeEmbeddedAgentCommand.mockResolvedValue({
      success: true,
      message: "Command accepted",
    });
    mockClient.controlHyperscapeEmbeddedAgent.mockResolvedValue({
      success: true,
      message: "Control accepted",
    });
    mockClient.controlAppSession.mockResolvedValue({
      success: true,
      message: "Control accepted",
    });

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <HyperscapeDetailExtension app={createApp()} />,
      );
      await flushPromises();
      await flushPromises();
    });

    const output = textOf(tree.root);
    expect(output).toContain("Hyperscape Embedded Control");
    expect(output).toContain("Scout");
    expect(output).toContain("Scout the woodland path");
    expect(output).toContain("Woodland Path");
    expect(output).toContain("Bronze sword");
    expect(output).toContain("Use the embedded agent-control viewer");

    const pauseButton = tree.root
      .findAll((node) => node.type === "button")
      .find((node) => textOf(node) === "Pause session");
    expect(pauseButton).toBeDefined();
    act(() => {
      pauseButton?.props.onClick();
    });
    expect(mockClient.controlHyperscapeEmbeddedAgent).toHaveBeenCalledWith(
      "character-1",
      "pause",
    );

    const quickCommand = tree.root
      .findAll((node) => node.type === "button")
      .find((node) => textOf(node) === "Scout ridge");
    expect(quickCommand).toBeDefined();
    act(() => {
      quickCommand?.props.onClick();
    });
    expect(mockClient.sendHyperscapeEmbeddedAgentCommand).toHaveBeenCalledWith(
      "character-1",
      "scout ridge",
    );

    const input = tree.root
      .findAll((node) => node.type === "input")
      .find((node) =>
        String(node.props.placeholder ?? "").includes("Tell the agent"),
      );
    expect(input).toBeDefined();
    act(() => {
      input?.props.onChange({ target: { value: "Stay cautious." } });
    });

    const sendButton = tree.root
      .findAll((node) => node.type === "button")
      .find((node) => textOf(node) === "Send");
    expect(sendButton).toBeDefined();
    act(() => {
      sendButton?.props.onClick();
    });
    expect(mockClient.sendHyperscapeAgentMessage).toHaveBeenCalledWith(
      "agent-1",
      "Stay cautious.",
    );
  });
});
