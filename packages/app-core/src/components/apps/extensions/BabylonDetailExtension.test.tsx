// @vitest-environment jsdom

import type { AppRunSummary, RegistryAppInfo } from "../../../api";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { textOf } from "../../../../../../test/helpers/react-test";

const mockUseApp = vi.hoisted(() => vi.fn());
const mockClient = vi.hoisted(() => ({
  getBabylonAgentStatus: vi.fn(),
  getBabylonAgentSummary: vi.fn(),
  getBabylonAgentGoals: vi.fn(),
  getBabylonAgentRecentTrades: vi.fn(),
  getBabylonPredictionMarkets: vi.fn(),
  getBabylonTeamDashboard: vi.fn(),
  getBabylonTeamConversations: vi.fn(),
  getBabylonAgentChat: vi.fn(),
  getBabylonAgentWallet: vi.fn(),
  getBabylonAgentTradingBalance: vi.fn(),
  controlAppRun: vi.fn(),
  sendAppRunMessage: vi.fn(),
}));

vi.mock("../../../state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../../api", () => ({
  client: mockClient,
}));

import { BabylonDetailExtension } from "./BabylonDetailExtension";

function createApp(overrides: Partial<RegistryAppInfo> = {}): RegistryAppInfo {
  return {
    name: "@elizaos/app-babylon",
    displayName: "Babylon",
    description: "Team-based market operator dashboard.",
    category: "game",
    launchType: "url",
    launchUrl: "http://localhost:3000",
    icon: null,
    capabilities: ["trades", "prediction-markets", "team-chat"],
    stars: 1,
    repository: "https://github.com/example/babylon",
    latestVersion: "1.0.0",
    supports: { v0: false, v1: false, v2: true },
    npm: {
      package: "@elizaos/app-babylon",
      v0Version: null,
      v1Version: null,
      v2Version: "1.0.0",
    },
    uiExtension: {
      detailPanelId: "babylon-operator-dashboard",
    },
    ...overrides,
  };
}

function createRun(overrides: Partial<AppRunSummary> = {}): AppRunSummary {
  return {
    runId: "run-babylon-1",
    appName: "@elizaos/app-babylon",
    displayName: "Babylon",
    pluginName: "@elizaos/app-babylon",
    launchType: "url",
    launchUrl: "http://localhost:3000",
    viewer: {
      url: "http://localhost:3000",
      embedParams: { embedded: "true" },
      postMessageAuth: true,
      sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
    },
    session: {
      sessionId: "babylon-session",
      appName: "@elizaos/app-babylon",
      mode: "spectate-and-steer",
      status: "running",
      displayName: "Babylon",
      agentId: "agent-babylon",
      characterId: "character-babylon",
      canSendCommands: true,
      controls: ["pause", "resume"],
      summary: "Coordinating trades with the team.",
      goalLabel: "Protect the market",
      suggestedPrompts: ["protect liquidity", "avoid thin markets"],
      telemetry: {
        recentActivity: [
          {
            action: "trade",
            detail: "Bought protection after volatility rose.",
            ts: "2026-04-06T00:00:10.000Z",
          },
        ],
      },
    },
    status: "running",
    summary: "Coordinating trades with the team.",
    startedAt: "2026-04-06T00:00:00.000Z",
    updatedAt: "2026-04-06T00:00:10.000Z",
    lastHeartbeatAt: "2026-04-06T00:00:10.000Z",
    supportsBackground: true,
    viewerAttachment: "attached",
    health: {
      state: "healthy",
      message: "Coordinating trades with the team.",
    },
    ...overrides,
  };
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("BabylonDetailExtension", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    Object.values(mockClient).forEach((mockFn) => mockFn.mockReset());
  });

  it("shows the operator fallback before a run exists", () => {
    mockUseApp.mockReturnValue({
      appRuns: [],
    });

    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<BabylonDetailExtension app={createApp()} />);
    });

    const output = textOf(tree.root);
    expect(output).toContain("Babylon operator surface");
    expect(output).toContain("Launch Babylon");
  });

  it("renders live market, team, and chat state", async () => {
    mockUseApp.mockReturnValue({
      appRuns: [createRun()],
    });

    mockClient.getBabylonAgentStatus.mockResolvedValue({
      id: "agent-babylon",
      name: "babylon-alpha",
      displayName: "Babylon Alpha",
      balance: 120.5,
      lifetimePnL: 42,
      winRate: 0.72,
      reputationScore: 91,
      totalTrades: 8,
      autonomous: true,
      autonomousTrading: true,
      autonomousPosting: true,
      autonomousCommenting: false,
      autonomousDMs: true,
      agentStatus: "active",
    });
    mockClient.getBabylonAgentSummary.mockResolvedValue({
      agent: {
        id: "agent-babylon",
        name: "babylon-alpha",
        totalDeposited: 250,
        totalWithdrawn: 25,
      },
      portfolio: {
        totalPnL: 42,
        positions: 4,
        totalAssets: 500,
        available: 150,
        wallet: 350,
        agents: 2,
        totalPoints: 11,
      },
    });
    mockClient.getBabylonAgentGoals.mockResolvedValue([
      {
        id: "goal-1",
        description: "Protect the market",
        status: "active",
        progress: 0.6,
        createdAt: "2026-04-06T00:00:00.000Z",
      },
    ]);
    mockClient.getBabylonAgentRecentTrades.mockResolvedValue({
      items: [
        {
          id: "trade-1",
          type: "trade",
          timestamp: "2026-04-06T00:00:10.000Z",
          ticker: "BAB",
          action: "buy",
          amount: 50,
          pnl: 4.25,
          summary: "Bought protection after volatility rose.",
        },
      ],
    });
    mockClient.getBabylonPredictionMarkets.mockResolvedValue({
      markets: [
        {
          id: "market-1",
          title: "Will Babylon close green?",
          status: "open",
          yesPrice: 0.61,
          noPrice: 0.39,
          volume: 1200,
          liquidity: 800,
          createdAt: "2026-04-06T00:00:00.000Z",
        },
      ],
      total: 1,
    });
    mockClient.getBabylonTeamDashboard.mockResolvedValue({
      agents: [
        {
          id: "team-1",
          name: "sentinel",
          balance: 100,
          lifetimePnL: 12,
          winRate: 0.5,
          reputationScore: 11,
          totalTrades: 2,
          autonomous: true,
        },
      ],
      summary: {
        ownerName: "Babylon Team",
        totals: {
          walletBalance: 350,
          lifetimePnL: 42,
          unrealizedPnL: 3,
          currentPnL: 9,
          openPositions: 4,
        },
      },
    });
    mockClient.getBabylonTeamConversations.mockResolvedValue({
      conversations: [
        {
          id: "conv-1",
          name: "Market protection",
          createdAt: "2026-04-06T00:00:00.000Z",
          updatedAt: "2026-04-06T00:00:10.000Z",
          isActive: true,
        },
      ],
      activeChatId: "conv-1",
    });
    mockClient.getBabylonAgentChat.mockResolvedValue({
      messages: [
        {
          id: "msg-1",
          senderId: "operator",
          senderName: "Operator",
          content: "Protect liquidity first.",
          createdAt: "2026-04-06T00:00:09.000Z",
        },
      ],
    });
    mockClient.getBabylonAgentWallet.mockResolvedValue({
      balance: 350,
      transactions: [
        {
          id: "txn-1",
          type: "deposit",
          amount: 50,
          timestamp: "2026-04-06T00:00:08.000Z",
        },
      ],
    });
    mockClient.getBabylonAgentTradingBalance.mockResolvedValue({
      balance: 150,
    });
    mockClient.controlAppRun.mockResolvedValue({
      success: true,
      message: "Babylon autonomy paused.",
    });
    mockClient.sendAppRunMessage.mockResolvedValue({
      success: true,
      message: "Queued",
    });

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(<BabylonDetailExtension app={createApp()} />);
      await flushPromises();
      await flushPromises();
    });

    const output = textOf(tree.root);
    expect(output).toContain("Babylon Operator Dashboard");
    expect(output).toContain("Babylon Alpha");
    expect(output).toContain("Protect the market");
    expect(output).toContain("Will Babylon close green?");
    expect(output).toContain("Market protection");
    expect(output).toContain("Protect liquidity first.");
    expect(output).toContain("Bought protection after volatility rose.");

    const pauseButton = tree.root
      .findAll((node) => node.type === "button")
      .find((node) => textOf(node) === "Pause agent");
    expect(pauseButton).toBeDefined();

    await act(async () => {
      pauseButton?.props.onClick();
      await flushPromises();
    });
    expect(mockClient.controlAppRun).toHaveBeenCalledWith(
      "run-babylon-1",
      "pause",
    );

    const input = tree.root
      .findAll((node) => node.type === "input")
      .find((node) =>
        String(node.props.placeholder ?? "").includes("Tell Babylon"),
      );
    expect(input).toBeDefined();
    expect(input).not.toBeNull();

    act(() => {
      input?.props.onChange({ target: { value: "Hold the line." } });
    });

    const sendButton = tree.root
      .findAll((node) => node.type === "button")
      .find((node) => textOf(node) === "Send");
    expect(sendButton).toBeDefined();

    await act(async () => {
      sendButton?.props.onClick();
      await flushPromises();
    });
    expect(mockClient.sendAppRunMessage).toHaveBeenCalledWith(
      "run-babylon-1",
      "Hold the line.",
    );
  });
});
