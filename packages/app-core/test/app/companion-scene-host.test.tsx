// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseApp = vi.fn();

vi.mock("@miladyai/app-core/hooks", () => ({
  useRenderGuard: vi.fn(),
}));

vi.mock("@miladyai/app-core/state", () => ({
  useApp: () => mockUseApp(),
  getVrmPreviewUrl: () => "/vrms/previews/milady-1.png",
  getVrmUrl: () => "/vrms/milady-1.vrm.gz",
  VRM_COUNT: 24,
  useCompanionSceneConfig: () => ({
    companionVrmPowerMode: "balanced",
    companionHalfFramerateMode: "when_saving_power",
    companionAnimateWhenHidden: false,
  }),
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock("@miladyai/app-core/utils", () => ({
  resolveAppAssetUrl: (value: string) => value,
}));

vi.mock("../../src/components/VrmStage", () => ({
  VrmStage: () =>
    React.createElement("div", { "data-testid": "companion-vrm-stage" }),
}));

import { CompanionSceneHost } from "../../src/components/CompanionSceneHost";

function createCompanionRootMock() {
  return {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

describe("CompanionSceneHost", () => {
  beforeEach(() => {
    mockUseApp.mockReturnValue({
      selectedVrmIndex: 1,
      customVrmUrl: "",
      uiTheme: "light",
      t: (key: string) => key,
      tab: "chat",
    });

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

    Object.defineProperty(globalThis, "window", {
      value: {
        innerWidth: 1440,
        innerHeight: 900,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      configurable: true,
    });
  });

  it("binds drag capture handlers to the root companion shell", () => {
    const rootMock = createCompanionRootMock();
    let tree: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      tree = TestRenderer.create(
        <CompanionSceneHost active>
          <div data-testid="companion-child">child</div>
        </CompanionSceneHost>,
        {
          createNodeMock: (element) =>
            element.props?.["data-testid"] === "companion-root"
              ? rootMock
              : null,
        },
      );
    });

    const root = tree?.root.findByProps({ "data-testid": "companion-root" });

    expect(typeof root.props.onPointerDownCapture).toBe("function");
    expect(typeof root.props.onPointerMoveCapture).toBe("function");
    expect(typeof root.props.onPointerUpCapture).toBe("function");
    expect(rootMock.addEventListener).toHaveBeenCalledWith(
      "wheel",
      expect.any(Function),
      { capture: true, passive: false },
    );
  });
});
