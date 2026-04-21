// @vitest-environment jsdom

import type { AppRunSummary, RegistryAppInfo } from "../../../api";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { textOf } from "../../../../../../test/helpers/react-test";

const mockUseApp = vi.hoisted(() => vi.fn());

vi.mock("../../../state", () => ({
  useApp: () => mockUseApp(),
}));

import { getAppDetailExtension } from "./registry";

function createApp(overrides: Partial<RegistryAppInfo> = {}): RegistryAppInfo {
  return {
    name: "@elizaos/app-defense-of-the-agents",
    displayName: "Defense of the Agents",
    description: "Tower defense operator shell.",
    category: "app",
    launchType: "url",
    launchUrl: "https://example.com/defense",
    icon: null,
    capabilities: ["observe"],
    stars: 1,
    repository: "https://github.com/example/defense",
    latestVersion: "1.0.0",
    supports: { v0: false, v1: false, v2: true },
    npm: {
      package: "@elizaos/app-defense-of-the-agents",
      v0Version: null,
      v1Version: null,
      v2Version: "1.0.0",
    },
    uiExtension: {
      detailPanelId: "defense-agent-control",
    },
    ...overrides,
  };
}

function createRun(overrides: Partial<AppRunSummary> = {}): AppRunSummary {
  return {
    runId: "run-defense-1",
    appName: "@elizaos/app-defense-of-the-agents",
    displayName: "Defense of the Agents",
    pluginName: "@elizaos/app-defense-of-the-agents",
    launchType: "url",
    launchUrl: "https://example.com/defense",
    viewer: {
      url: "http://localhost:31337/api/apps/defense-of-the-agents/viewer",
      sandbox: "allow-scripts allow-same-origin",
    },
    session: {
      sessionId: "defense-session",
      appName: "@elizaos/app-defense-of-the-agents",
      mode: "spectate-and-steer",
      status: "running",
      displayName: "Defense of the Agents",
      canSendCommands: true,
      controls: ["pause"],
      summary: "Holding mid lane while autoplay farms safely.",
      suggestedPrompts: ["tell the hero to rotate bot"],
      telemetry: {
        heroClass: "Ranger",
        heroLane: "mid",
        heroLevel: 12,
        heroHp: 73,
        heroMaxHp: 100,
        autoPlay: true,
        strategyVersion: 4,
        bestStrategyVersion: 5,
        recentActivity: [
          {
            action: "rotate",
            detail: "Moved from top lane to defend mid.",
            ts: "2026-04-06T00:00:01.000Z",
          },
        ],
      },
    },
    status: "running",
    summary: "Holding mid lane while autoplay farms safely.",
    startedAt: "2026-04-06T00:00:00.000Z",
    updatedAt: "2026-04-06T00:00:10.000Z",
    lastHeartbeatAt: "2026-04-06T00:00:10.000Z",
    supportsBackground: true,
    viewerAttachment: "attached",
    health: {
      state: "healthy",
      message: "Holding mid lane while autoplay farms safely.",
    },
    ...overrides,
  };
}

describe("app detail extensions", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
  });

  it("registers the defense detail panel by id", () => {
    expect(getAppDetailExtension(createApp())).not.toBeNull();
    expect(
      getAppDetailExtension(
        createApp({
          uiExtension: {
            detailPanelId: "unknown-panel",
          },
        }),
      ),
    ).toBeNull();
  });

  it("renders the operator fallback before app runs hydrate", () => {
    mockUseApp.mockReturnValue({
      appRuns: undefined,
    });

    const Extension = getAppDetailExtension(createApp());
    expect(Extension).not.toBeNull();
    if (!Extension) {
      throw new Error("expected defense detail extension to be registered");
    }

    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<Extension app={createApp()} />);
    });
    const output = textOf(tree.root);

    expect(output).toContain("Operator Surface");
    expect(output).toContain("stable local shell");
  });

  it("renders live run telemetry and recent behavior", () => {
    mockUseApp.mockReturnValue({
      appRuns: [createRun()],
    });

    const Extension = getAppDetailExtension(createApp());
    expect(Extension).not.toBeNull();
    if (!Extension) {
      throw new Error("expected defense detail extension to be registered");
    }

    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<Extension app={createApp()} />);
    });
    const output = textOf(tree.root);

    expect(output).toContain("Live Operator Surface");
    expect(output).toContain("Ranger Lv12 in mid lane");
    expect(output).toContain("73/100 HP");
    expect(output).toContain("Holding mid lane while autoplay farms safely.");
    expect(output).toContain("Moved from top lane to defend mid.");
    expect(output).toContain("tell the hero to rotate bot");
  });
});
