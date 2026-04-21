// @vitest-environment jsdom

import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { textOf } from "../../../../../../test/helpers/react-test";
import type { AppRunSummary, RegistryAppInfo } from "../../../api";

const mockUseApp = vi.hoisted(() => vi.fn());
const mockClient = vi.hoisted(() => ({
  sendAppRunMessage: vi.fn(),
  sendAppSessionMessage: vi.fn(),
  controlAppRun: vi.fn(),
}));

vi.mock("../../../state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../../api", () => ({
  client: mockClient,
}));

import { TwoThousandFourScapeDetailExtension } from "./TwoThousandFourScapeDetailExtension";

function createApp(overrides: Partial<RegistryAppInfo> = {}): RegistryAppInfo {
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

function createRun(overrides: Partial<AppRunSummary> = {}): AppRunSummary {
  return {
    runId: "run-2004-1",
    appName: "@elizaos/app-2004scape",
    displayName: "2004scape",
    pluginName: "@elizaos/app-2004scape",
    launchType: "connect",
    launchUrl: "http://localhost:8880",
    viewer: {
      url: "/api/apps/2004scape/viewer",
      embedParams: {
        bot: "BotName",
        password: "secret",
      },
      postMessageAuth: true,
      authMessage: {
        type: "RS_2004SCAPE_AUTH",
        authToken: "token",
        sessionToken: "secret",
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
      summary: "Tutorial island: Do you want to skip the tutorial?",
      goalLabel: "Finish tutorial and reach the mainland.",
      suggestedPrompts: [
        "Finish tutorial",
        "Chop nearby tree",
        "Catch nearby fish",
        "Walk around",
      ],
      telemetry: {
        botName: "BotName",
        autoPlay: true,
        intent: "tutorial",
        tutorial: {
          active: true,
          guideNearby: true,
          prompt: "Do you want to skip the tutorial?",
        },
        player: {
          name: "Scout Bot",
          worldX: 3222,
          worldZ: 3221,
          hp: 10,
          maxHp: 10,
        },
        combatStyle: {
          weaponName: "Bronze dagger",
          activeStyle: "Accurate",
        },
        nearbyNpcs: [
          {
            name: "RuneScape Guide",
            distance: 1.2,
            optionsWithIndex: [{ text: "Talk-to" }],
          },
        ],
        nearbyLocs: [
          {
            name: "Tree",
            distance: 2.4,
            optionsWithIndex: [{ text: "Chop down" }],
          },
        ],
        gameMessages: [
          {
            sender: "Game",
            text: "Welcome to RuneScape.",
          },
        ],
        recentDialogs: [
          {
            text: ["RuneScape Guide", "Do you want to skip the tutorial?"],
          },
        ],
        skills: [
          { name: "Woodcutting", level: 1 },
          { name: "Fishing", level: 1 },
        ],
        inventory: [{ name: "Shrimps", amount: 1 }],
        recentActivity: [
          {
            action: "tutorial",
            detail: "Accepted the starter appearance preset.",
            ts: "2026-04-06T00:00:10.000Z",
          },
        ],
      },
    },
    status: "running",
    summary: "Tutorial island: Do you want to skip the tutorial?",
    startedAt: "2026-04-06T00:00:00.000Z",
    updatedAt: "2026-04-06T00:00:10.000Z",
    lastHeartbeatAt: "2026-04-06T00:00:10.000Z",
    supportsBackground: true,
    viewerAttachment: "attached",
    health: {
      state: "healthy",
      message: "Tutorial island: Do you want to skip the tutorial?",
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
    Object.values(mockClient).forEach((mockFn) => {
      mockFn.mockReset();
    });
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

    mockClient.sendAppRunMessage.mockResolvedValue({
      success: true,
      message: "Queued",
    });
    mockClient.controlAppRun.mockResolvedValue({
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
    expect(output).toContain("Credentials stored");
    expect(output).toContain("Bot BotName is ready for automatic sign-in.");
    expect(output).toContain("Autoplay active");
    expect(output).toContain("Tutorial in progress");
    expect(output).toContain("Live steering ready");
    expect(output).toContain("Do you want to skip the tutorial?");
    expect(output).toContain("RuneScape Guide");
    expect(output).toContain("Bronze dagger");
    expect(output).toContain("Chop nearby tree");
    expect(output).not.toContain("RS_2004SCAPE_AUTH");
    expect(output).not.toContain("secret");

    const pauseButton = tree.root
      .findAll((node) => node.type === "button")
      .find((node) => textOf(node) === "Pause session");
    expect(pauseButton).toBeDefined();
    act(() => {
      pauseButton?.props.onClick();
    });
    expect(mockClient.controlAppRun).toHaveBeenCalledWith(
      "run-2004-1",
      "pause",
    );

    const input = tree.root
      .findAll((node) => node.type === "input")
      .find((node) =>
        String(node.props.placeholder ?? "").includes("what to train"),
      );
    expect(input).toBeDefined();
    act(() => {
      input?.props.onChange({ target: { value: "Keep banking first." } });
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
      "run-2004-1",
      "Keep banking first.",
    );
  });
});
