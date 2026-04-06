// @vitest-environment jsdom

import type React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findButtonByText,
  textOf,
} from "../../../../../test/helpers/react-test";
import type { AppRunSummary } from "../../api";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@miladyai/ui", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

const mockUseApp = vi.hoisted(() => vi.fn());

vi.mock("../../state", () => ({
  useApp: () => mockUseApp(),
}));

import { getRunAttentionReasons, RunningAppsPanel } from "./RunningAppsPanel";

function createRun(overrides: Partial<AppRunSummary> = {}): AppRunSummary {
  return {
    runId: "run-1",
    appName: "@elizaos/app-hyperscape",
    displayName: "Hyperscape",
    pluginName: "@elizaos/app-hyperscape",
    launchType: "connect",
    launchUrl: "https://example.com/hyperscape",
    viewer: {
      url: "https://example.com/viewer",
      sandbox: "allow-scripts allow-same-origin",
      postMessageAuth: true,
      authMessage: {
        type: "HYPERSCAPE_AUTH",
        authToken: "token-1",
      },
    },
    session: {
      sessionId: "session-1",
      appName: "@elizaos/app-hyperscape",
      mode: "spectate-and-steer",
      status: "running",
      displayName: "Hyperscape",
      agentId: "agent-1",
      characterId: "character-1",
      followEntity: "entity-9",
      canSendCommands: true,
      controls: ["pause", "resume"],
      summary: "Viewer ready.",
      goalLabel: "Stay near the team.",
      suggestedPrompts: ["Hold position"],
      telemetry: null,
    },
    status: "running",
    summary: "Viewer ready.",
    startedAt: "2026-04-06T00:00:00.000Z",
    updatedAt: "2026-04-06T00:00:10.000Z",
    lastHeartbeatAt: new Date().toISOString(),
    supportsBackground: true,
    viewerAttachment: "attached",
    health: {
      state: "healthy",
      message: null,
    },
    ...overrides,
  };
}

function requireTree(
  tree: TestRenderer.ReactTestRenderer | null,
): TestRenderer.ReactTestRenderer {
  if (!tree) {
    throw new Error("Expected a rendered test tree.");
  }
  return tree;
}

describe("RunningAppsPanel", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockUseApp.mockReturnValue({
      t: (_key: string, options?: { defaultValue?: string }) =>
        options?.defaultValue ?? _key,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("derives stale and unavailable attention reasons from existing run fields", () => {
    const reasons = getRunAttentionReasons(
      createRun({
        health: {
          state: "degraded",
          message: "Viewer bridge is lagging.",
        },
        viewerAttachment: "detached",
        session: {
          sessionId: "session-1",
          appName: "@elizaos/app-hyperscape",
          mode: "spectate-and-steer",
          status: "disconnected",
          displayName: "Hyperscape",
          agentId: "agent-1",
          characterId: "character-1",
          followEntity: "entity-9",
          canSendCommands: false,
          controls: [],
          summary: "Viewer bridge is lagging.",
          goalLabel: null,
          suggestedPrompts: [],
          telemetry: null,
        },
        lastHeartbeatAt: "2026-04-05T00:00:00.000Z",
        viewer: {
          url: "https://example.com/viewer",
          sandbox: "allow-scripts allow-same-origin",
          postMessageAuth: true,
        },
      }),
      new Date("2026-04-06T00:05:00.000Z").getTime(),
    );

    expect(reasons).toContain("Viewer bridge is lagging.");
    expect(reasons).toContain("Viewer is detached");
    expect(reasons).toContain("Command bridge is unavailable");
    expect(reasons).toContain("Session status is disconnected");
    expect(reasons).toContain("Heartbeat is stale");
  });

  it("surfaces recovery actions for a detached stale run", async () => {
    const onOpenRun = vi.fn();
    const onDetachRun = vi.fn();
    const onStopRun = vi.fn();
    const run = createRun({
      viewerAttachment: "detached",
      health: {
        state: "degraded",
        message: "Reattach the viewer to continue observing the run.",
      },
      session: {
        sessionId: "session-1",
        appName: "@elizaos/app-hyperscape",
        mode: "spectate-and-steer",
        status: "stale",
        displayName: "Hyperscape",
        agentId: "agent-1",
        characterId: "character-1",
        followEntity: "entity-9",
        canSendCommands: false,
        controls: ["pause"],
        summary: "Reattach the viewer to continue observing the run.",
        goalLabel: "Stay near the team.",
        suggestedPrompts: ["Hold position"],
        telemetry: null,
      },
      lastHeartbeatAt: "2026-04-04T00:00:00.000Z",
      summary: "Reattach the viewer to continue observing the run.",
    });

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <RunningAppsPanel
          runs={[run]}
          selectedRunId={run.runId}
          busyRunId={null}
          onSelectRun={vi.fn()}
          onOpenRun={onOpenRun}
          onDetachRun={onDetachRun}
          onStopRun={onStopRun}
        />,
      );
    });

    const root = requireTree(tree).root;
    expect(textOf(root)).toContain("Attention needed");
    expect(textOf(root)).toContain("Viewer is detached");
    expect(textOf(root)).toContain("Command bridge is unavailable");
    expect(textOf(root)).toContain("Heartbeat is stale");
    expect(textOf(root)).toContain("Command bridge");
    expect(textOf(root)).toContain("Unavailable");
    expect(textOf(root)).toContain("Controls");
    expect(textOf(root)).toContain("pause");
    expect(textOf(root)).toContain("Agent");
    expect(textOf(root)).toContain("agent-1");
    expect(textOf(root)).toContain("Character");
    expect(textOf(root)).toContain("character-1");
    expect(textOf(root)).toContain("Follow target");
    expect(textOf(root)).toContain("entity-9");

    await act(async () => {
      findButtonByText(root, "Reattach viewer").props.onClick();
    });
    expect(onOpenRun).toHaveBeenCalledWith(run);
  });

  it("keeps the primary inspection action for healthy attached runs", async () => {
    const onOpenRun = vi.fn();
    const run = createRun();

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <RunningAppsPanel
          runs={[run]}
          selectedRunId={run.runId}
          busyRunId={null}
          onSelectRun={vi.fn()}
          onOpenRun={onOpenRun}
          onDetachRun={vi.fn()}
          onStopRun={vi.fn()}
        />,
      );
    });

    const root = requireTree(tree).root;
    expect(textOf(root)).toContain("Inspect viewer");
    expect(textOf(root)).not.toContain("Attention needed");

    await act(async () => {
      findButtonByText(root, "Inspect viewer").props.onClick();
    });
    expect(onOpenRun).toHaveBeenCalledWith(run);
  });
});
