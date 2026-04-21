// @vitest-environment jsdom

import type {
  AppRunSummary,
  AppViewerAuthMessage,
} from "@miladyai/app-core/api";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flush } from "../../../../test/helpers/react-test";

interface OverlayContextStub {
  appRuns: AppRunSummary[];
  activeGameRunId: string;
  activeGameDisplayName: string;
  activeGamePostMessageAuth: boolean;
  activeGamePostMessagePayload: AppViewerAuthMessage | null;
  activeGameViewerUrl: string;
  activeGameSandbox: string;
  setState: (key: string, value: unknown) => void;
  t: (key: string) => string;
}

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => mockUseApp(),
}));

import { GameViewOverlay } from "../../src/components/apps/GameViewOverlay";

function createRunSummary(
  payload: AppViewerAuthMessage,
  overrides: Partial<AppRunSummary> = {},
): AppRunSummary {
  return {
    runId: "run-1",
    appName: "@hyperscape/plugin-hyperscape",
    displayName: "Hyperscape",
    pluginName: "@hyperscape/plugin-hyperscape",
    launchType: "connect",
    launchUrl: "http://localhost:3333",
    viewer: {
      url: "http://localhost:3333?embedded=true&surface=agent-control",
      embedParams: {
        embedded: "true",
        surface: "agent-control",
      },
      postMessageAuth: true,
      sandbox: "allow-scripts allow-same-origin",
      authMessage: payload,
    },
    session: null,
    status: "running",
    summary: "Viewer ready.",
    startedAt: "2026-04-06T00:00:00.000Z",
    updatedAt: "2026-04-06T00:00:00.000Z",
    lastHeartbeatAt: "2026-04-06T00:00:00.000Z",
    supportsBackground: true,
    viewerAttachment: "attached",
    health: {
      state: "healthy",
      message: null,
    },
    ...overrides,
  };
}

function createContext(
  payload: AppViewerAuthMessage,
  overrides: Partial<OverlayContextStub> = {},
): OverlayContextStub {
  const run = createRunSummary(payload);
  return {
    appRuns: [run],
    activeGameRunId: run.runId,
    activeGameDisplayName: run.displayName,
    activeGamePostMessageAuth: true,
    activeGamePostMessagePayload: payload,
    activeGameViewerUrl: run.viewer?.url ?? "",
    activeGameSandbox: run.viewer?.sandbox ?? "allow-scripts allow-same-origin",
    setState: vi.fn(),
    t: (key: string) => key,
    ...overrides,
  };
}

describe("GameViewOverlay", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends auth to the overlay iframe after the viewer signals readiness", async () => {
    const payload: AppViewerAuthMessage = {
      type: "HYPERSCAPE_AUTH",
      authToken: "token-overlay",
      agentId: "agent-1",
      characterId: "char-1",
      followEntity: "char-1",
    };
    const ctx = createContext(payload);
    mockUseApp.mockReturnValue(ctx);

    let messageHandler:
      | ((event: MessageEvent<{ type?: string }>) => void)
      | null = null;
    vi.spyOn(window, "addEventListener").mockImplementation(((
      type: string,
      listener: EventListenerOrEventListenerObject,
    ) => {
      if (type === "message" && typeof listener === "function") {
        messageHandler = listener as (
          event: MessageEvent<{ type?: string }>,
        ) => void;
      }
    }) as typeof window.addEventListener);
    vi.spyOn(window, "removeEventListener").mockImplementation(
      (() => {}) as typeof window.removeEventListener,
    );

    const postMessage =
      vi.fn<(message: AppViewerAuthMessage, targetOrigin: string) => void>();
    Object.defineProperty(window, "postMessage", {
      value: postMessage,
      writable: true,
      configurable: true,
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(GameViewOverlay), {
        createNodeMock: (element) => {
          if (element.type === "iframe") {
            return { contentWindow: window };
          }
          return {};
        },
      });
    });
    await flush();

    expect(
      tree.root.find(
        (node) => node.props?.["data-testid"] === "game-view-overlay-iframe",
      ),
    ).toBeDefined();

    await act(async () => {
      messageHandler?.({
        source: window,
        data: { type: "HYPERSCAPE_READY" },
        origin: "http://localhost:3333",
      } as MessageEvent<{ type?: string }>);
    });

    expect(postMessage).toHaveBeenCalledWith(payload, "http://localhost:3333");
    expect(postMessage).toHaveBeenCalledTimes(1);
  });
});
