// @vitest-environment jsdom

import type { AppRunSummary, RegistryAppInfo } from "../../../api";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { textOf } from "../../../../../../test/helpers/react-test";

const mockUseApp = vi.hoisted(() => vi.fn());
const mockClient = vi.hoisted(() => ({
  sendAppSessionMessage: vi.fn(),
  controlAppSession: vi.fn(),
}));

vi.mock("../../../state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../../api", () => ({
  client: mockClient,
}));

import { TwoThousandFourScapeDetailExtension } from "./TwoThousandFourScapeDetailExtension";

function createApp(
  overrides: Partial<RegistryAppInfo> = {},
): RegistryAppInfo {
  return {
    name: "@elizaos/app-2004scape",
    displayName: "2004scape",
    description: "Retro MMO operator surface.",
    category: "game",
    launchType: "connect",
    launchUrl: "http://localhost:8880",
    icon: null,
    capabilities: ["observe"],
    stars: 1,
    repository: "https://github.com/example/2004scape",
    latestVersion: "1.0.0",
    supports: { v0: false, v1: true, v2: true },
    npm: {
      package: "@elizaos/app-2004scape",
      v0Version: null,
      v1Version: "1.0.0",
      v2Version: "1.0.0",
    },
    uiExtension: {
      detailPanelId: "2004scape-operator-dashboard",
    },
    ...overrides,
  };
}

function createRun(
  overrides: Partial<AppRunSummary> = {},
): AppRunSummary {
  return {
    runId: "run-2004-1",
    appName: "@elizaos/app-2004scape",
    displayName: "2004scape",
    pluginName: "@elizaos/app-2004scape",
    launchType: "connect",
    launchUrl: "http://localhost:8880",
    viewer: {
      url: "http://localhost:8880/bot",
      embedParams: {
        bot: "BotName",
        password: "secret",
      },
      postMessageAuth: true,
      authMessage: {
        type: "RS_2004SCAPE_AUTH",
        authToken: "token",
        characterId: "character-1",
        agentId: "agent-1",
      },
      sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
    },
    session: {
      sessionId: "2004scape-session",
      appName: "@elizaos/app-2004scape",
      mode: "spectate-and-steer",
      status: "running",
      displayName: "2004scape",
      agentId: "agent-1",
      characterId: "character-1",
      followEntity: "character-1",
      canSendCommands: true,
      controls: ["pause", "resume"],
      summary: "Mining and banking safely in Lumbridge.",
      goalLabel: "Train mining without risking the account.",
      suggestedPrompts: ["bank before logging off", "avoid combat"],
      telemetry: {
        recentActivity: [
          {
            action: "mine",
            detail: "Mined iron ore near the south wall.",
            ts: "2026-04-06T00:00:10.000Z",
          },
        ],
      },
    },
    status: "running",
    summary: "Mining and banking safely in Lumbridge.",
    startedAt: "2026-04-06T00:00:00.000Z",
    updatedAt: "2026-04-06T00:00:10.000Z",
    lastHeartbeatAt: "2026-04-06T00:00:10.000Z",
    supportsBackground: true,
    viewerAttachment: "attached",
    health: {
      state: "healthy",
      message: "Mining and banking safely in Lumbridge.",
    },
    ...overrides,
  };
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("TwoThousandFourScapeDetailExtension", () => {
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
      tree = TestRenderer.create(
        <TwoThousandFourScapeDetailExtension app={createApp()} />,
      );
    });

    const output = textOf(tree.root);
    expect(output).toContain("2004scape operator surface");
    expect(output).toContain("Launch 2004scape");
  });

  it("renders login, runtime, and steering state", async () => {
    mockUseApp.mockReturnValue({
      appRuns: [createRun()],
    });

    mockClient.sendAppSessionMessage.mockResolvedValue({
      success: true,
      message: "Queued",
    });
    mockClient.controlAppSession.mockResolvedValue({
      success: true,
      message: "Control accepted",
    });

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <TwoThousandFourScapeDetailExtension app={createApp()} />,
      );
      await flushPromises();
    });

    const output = textOf(tree.root);
    expect(output).toContain("2004scape Operator Surface");
    expect(output).toContain("Auto-login RS_2004SCAPE_AUTH");
    expect(output).toContain("Continuously running service");
    expect(output).toContain("Mining and banking safely in Lumbridge.");
    expect(output).toContain("Mined iron ore near the south wall.");
    expect(output).toContain("bank before logging off");

    const pauseButton = tree.root
      .findAll((node) => node.type === "button")
      .find((node) => textOf(node) === "Pause session");
    expect(pauseButton).toBeDefined();
    act(() => {
      pauseButton?.props.onClick();
    });
    expect(mockClient.controlAppSession).toHaveBeenCalledWith(
      "@elizaos/app-2004scape",
      "2004scape-session",
      "pause",
    );

    const input = tree.root
      .findAll((node) => node.type === "input")
      .find((node) =>
        String(node.props.placeholder ?? "").includes("Tell the bot"),
      );
    expect(input).toBeDefined();
    act(() => {
      input?.props.onChange({ target: { value: "Keep banking first." } });
    });

    const sendButton = tree.root
      .findAll((node) => node.type === "button")
      .find((node) => textOf(node) === "Send");
    expect(sendButton).toBeDefined();
    act(() => {
      sendButton?.props.onClick();
    });
    expect(mockClient.sendAppSessionMessage).toHaveBeenCalledWith(
      "@elizaos/app-2004scape",
      "2004scape-session",
      "Keep banking first.",
    );
  });
});
