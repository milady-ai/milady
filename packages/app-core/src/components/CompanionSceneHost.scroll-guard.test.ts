// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUseApp = vi.fn();

vi.mock("@miladyai/app-core/hooks", () => ({
  useRenderGuard: vi.fn(),
}));

vi.mock("@miladyai/app-core/state", () => ({
  getVrmPreviewUrl: () => "/vrms/previews/milady-1.png",
  getVrmUrl: () => "/vrms/milady-1.vrm.gz",
  useApp: () => mockUseApp(),
  VRM_COUNT: 24,
}));

vi.mock("@miladyai/app-core/utils", () => ({
  resolveAppAssetUrl: (assetPath: string) => assetPath,
}));

vi.mock("./VrmStage", () => ({
  VrmStage: () => React.createElement("div", null, "VrmStage"),
}));

import { CompanionSceneHost } from "./CompanionSceneHost";

const COMPANION_ZOOM_STORAGE_KEY = "milady.companion.zoom.v1";

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    selectedVrmIndex: 1,
    customVrmUrl: "",
    uiTheme: "dark",
    tab: "chat",
    t: (key: string) => key,
    ...overrides,
  };
}

describe("CompanionSceneHost scroll guard", () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    mockUseApp.mockReset();
    mockUseApp.mockReturnValue(createContext());

    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      },
      configurable: true,
      writable: true,
    });

    Object.defineProperty(globalThis, "fetch", {
      value: vi.fn(async () => ({
        ok: true,
      })),
      configurable: true,
      writable: true,
    });

    Object.defineProperty(window, "innerWidth", {
      value: 1440,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 900,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "fetch", {
      value: originalFetch,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, "localStorage", {
      value: originalLocalStorage,
      configurable: true,
      writable: true,
    });
  });

  function renderSceneHost(): ReactTestRenderer {
    return TestRenderer.create(
      React.createElement(
        CompanionSceneHost,
        { active: true },
        React.createElement("div", { "data-testid": "chat-overlay" }),
      ),
    );
  }

  it("ignores wheel zoom from scrollable transcript targets", async () => {
    let tree: ReactTestRenderer;
    await act(async () => {
      tree = renderSceneHost();
    });

    const root = tree!.root.findByProps({ "data-testid": "companion-root" });
    const onWheelCapture = root.props.onWheelCapture as (
      event: React.WheelEvent<HTMLDivElement>,
    ) => void;

    const scrollRegion = document.createElement("div");
    scrollRegion.setAttribute("data-no-camera-zoom", "true");
    const nestedTarget = document.createElement("span");
    scrollRegion.appendChild(nestedTarget);
    const preventDefault = vi.fn();

    onWheelCapture({
      ctrlKey: false,
      currentTarget: { clientHeight: 900, clientWidth: 1440 },
      deltaMode: 0,
      deltaY: 120,
      preventDefault,
      target: nestedTarget,
    } as React.WheelEvent<HTMLDivElement>);

    expect(globalThis.localStorage.setItem).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("persists zoom when wheel input comes from the scene surface", async () => {
    let tree: ReactTestRenderer;
    await act(async () => {
      tree = renderSceneHost();
    });

    const root = tree!.root.findByProps({ "data-testid": "companion-root" });
    const onWheelCapture = root.props.onWheelCapture as (
      event: React.WheelEvent<HTMLDivElement>,
    ) => void;
    const preventDefault = vi.fn();

    onWheelCapture({
      ctrlKey: false,
      currentTarget: { clientHeight: 900, clientWidth: 1440 },
      deltaMode: 0,
      deltaY: 120,
      preventDefault,
      target: document.createElement("div"),
    } as React.WheelEvent<HTMLDivElement>);

    expect(globalThis.localStorage.setItem).toHaveBeenCalledWith(
      COMPANION_ZOOM_STORAGE_KEY,
      expect.any(String),
    );
    expect(preventDefault).toHaveBeenCalledOnce();
  });
});
