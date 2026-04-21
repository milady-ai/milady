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
  useCompanionSceneConfig: () => ({
    zoom: 1,
    setZoom: vi.fn(),
    position: { x: 0, y: 0 },
    setPosition: vi.fn(),
  }),
  useTranslation: () => ({ t: (k: string) => k }),
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

function createCompanionRootMock() {
  const listeners = new Map<string, EventListener>();
  const node = {
    addEventListener: vi.fn(
      (type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === "function") {
          listeners.set(type, listener);
        }
      },
    ),
    removeEventListener: vi.fn(
      (type: string, listener: EventListenerOrEventListenerObject) => {
        if (listeners.get(type) === listener) {
          listeners.delete(type);
        }
      },
    ),
  };

  return {
    node,
    getListener(type: string) {
      return listeners.get(type) as ((event: Event) => void) | undefined;
    },
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

  function renderSceneHost(
    rootMock: ReturnType<typeof createCompanionRootMock>,
  ): ReactTestRenderer {
    return TestRenderer.create(
      React.createElement(
        CompanionSceneHost,
        { active: true },
        React.createElement("div", { "data-testid": "chat-overlay" }),
      ),
      {
        createNodeMock: (element) =>
          element.props?.["data-testid"] === "companion-root"
            ? rootMock.node
            : null,
      },
    );
  }

  it("ignores wheel zoom from scrollable transcript targets", async () => {
    const rootMock = createCompanionRootMock();
    await act(async () => {
      renderSceneHost(rootMock);
    });

    const wheelListener = rootMock.getListener("wheel");

    const scrollRegion = document.createElement("div");
    scrollRegion.setAttribute("data-no-camera-zoom", "true");
    const nestedTarget = document.createElement("span");
    scrollRegion.appendChild(nestedTarget);
    const preventDefault = vi.fn();

    wheelListener?.({
      ctrlKey: false,
      deltaMode: 0,
      deltaY: 120,
      preventDefault,
      target: nestedTarget,
    } as WheelEvent);

    expect(globalThis.localStorage.setItem).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("persists zoom when wheel input comes from the scene surface", async () => {
    const rootMock = createCompanionRootMock();
    await act(async () => {
      renderSceneHost(rootMock);
    });

    const wheelListener = rootMock.getListener("wheel");
    const preventDefault = vi.fn();

    wheelListener?.({
      ctrlKey: false,
      deltaMode: 0,
      deltaY: 120,
      preventDefault,
      target: document.createElement("div"),
    } as WheelEvent);

    expect(globalThis.localStorage.setItem).toHaveBeenCalledWith(
      COMPANION_ZOOM_STORAGE_KEY,
      expect.any(String),
    );
    expect(preventDefault).toHaveBeenCalledOnce();
  });
});
