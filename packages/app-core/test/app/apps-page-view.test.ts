import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { text, flush } from "../../../../test/helpers/react-test";

interface AppsPageContextStub {
  appsSubTab: "browse" | "games";
  activeGameViewerUrl: string;
  activeGameRunId: string;
  activeGameDisplayName: string;
  appRuns: unknown[];
  t: (key: string, options?: { defaultValue?: string }) => string;
  setState: (key: string, value: "browse" | "games") => void;
}

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => mockUseApp(),
}));

import { AppsPageView } from "../../src/components/pages/AppsPageView.tsx";

const StubAppsView = () => React.createElement("div", null, "APPS_VIEW");
const StubGameView = () => React.createElement("div", null, "GAME_VIEW");

function createContext(
  overrides?: Partial<AppsPageContextStub>,
): AppsPageContextStub {
  return {
    appsSubTab: "browse",
    activeGameViewerUrl: "",
    activeGameRunId: "",
    activeGameDisplayName: "",
    appRuns: [],
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
    setState: vi.fn<AppsPageContextStub["setState"]>(),
    ...overrides,
  };
}

describe("AppsPageView", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders app browser surface without Browse/Games tabs", async () => {
    mockUseApp.mockReturnValue(createContext());

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(AppsPageView, {
          appsView: StubAppsView,
          gameView: StubGameView,
        }),
      );
    });
    await flush();

    const root = tree?.root;
    expect(root.findAll((node) => text(node) === "APPS_VIEW").length).toBe(1);
    expect(root.findAll((node) => text(node) === "GAME_VIEW").length).toBe(0);
    expect(root.findAll((node) => text(node) === "Browse").length).toBe(0);
    expect(root.findAll((node) => text(node) === "Games").length).toBe(0);
  });

  it("renders full-screen game mode when a game is active", async () => {
    mockUseApp.mockReturnValue(
      createContext({
        appsSubTab: "games",
        activeGameRunId: "run-1",
        activeGameViewerUrl: "http://localhost:5175/viewer",
      }),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(AppsPageView, {
          appsView: StubAppsView,
          gameView: StubGameView,
        }),
      );
    });
    await flush();

    const root = tree?.root;
    expect(root.findAll((node) => text(node) === "GAME_VIEW").length).toBe(1);
    expect(root.findAll((node) => text(node) === "APPS_VIEW").length).toBe(0);
  });

  it("falls back to app browser when game mode has no active viewer", async () => {
    const ctx = createContext({
      appsSubTab: "games",
      activeGameViewerUrl: "",
    });
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(AppsPageView, {
          appsView: StubAppsView,
          gameView: StubGameView,
        }),
      );
    });
    await flush();

    const root = tree?.root;
    expect(root.findAll((node) => text(node) === "APPS_VIEW").length).toBe(1);
    expect(ctx.setState).toHaveBeenCalledWith("appsSubTab", "browse");
  });
});
