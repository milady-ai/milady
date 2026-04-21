// @vitest-environment jsdom
import { StrictMode } from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@miladyai/app-core/utils", () => ({
  resolveAppAssetUrl: (path: string) => path,
}));

class MockVrmEngine {
  static instances: MockVrmEngine[] = [];

  loadVrmFromUrl = vi.fn(async () => {});
  getState = vi.fn(() => ({
    vrmLoaded: true,
    vrmName: "eliza-1.vrm.gz",
    loadError: null,
    idlePlaying: false,
    idleTime: 0,
    idleTracks: 0,
  }));
  getDebugInfo = vi.fn(() => ({}));
  setInteractionEnabled = vi.fn();
  setCameraProfile = vi.fn();
  setInteractionMode = vi.fn();
  setPaused = vi.fn();
  setMinimalBackgroundMode = vi.fn();
  setLowPowerRenderMode = vi.fn();
  setHalfFramerateMode = vi.fn();
  setPointerParallaxEnabled = vi.fn();
  setPointerParallaxTarget = vi.fn();
  resetPointerParallax = vi.fn();
  setWorldUrl = vi.fn(async () => {});
  setEnvironmentTheme = vi.fn();
  setMouthOpen = vi.fn();
  setSpeaking = vi.fn();
  resize = vi.fn();
  dispose = vi.fn();
  isInitialized = vi.fn(() => false);

  private readyPromise: Promise<void>;
  private resolveReadyPromise: () => void = () => {};
  private rejectReadyPromise: (error?: unknown) => void = () => {};

  constructor() {
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReadyPromise = resolve;
      this.rejectReadyPromise = reject;
    });
    MockVrmEngine.instances.push(this);
  }

  setup = vi.fn(() => {});

  whenReady = vi.fn(() => this.readyPromise);

  resolveReady(): void {
    this.resolveReadyPromise();
  }

  rejectReady(error: unknown): void {
    this.rejectReadyPromise(error);
  }
}

import { VrmViewer } from "../../src/components/avatar/VrmViewer.tsx";

type MockVrmEngineInstance = {
  setWorldUrl: ReturnType<typeof vi.fn>;
  loadVrmFromUrl: ReturnType<typeof vi.fn>;
  resolveReady: () => void;
  rejectReady: (error: unknown) => void;
};

function getMockInstances(): MockVrmEngineInstance[] {
  return MockVrmEngine.instances;
}

describe("VrmViewer", () => {
  beforeEach(() => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = undefined;
    const mockWindow = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setInterval: vi.fn(() => 42),
      clearInterval: vi.fn(),
    } as unknown as Window & typeof globalThis;
    globalThis.window = mockWindow;

    (
      globalThis as { requestAnimationFrame?: typeof requestAnimationFrame }
    ).requestAnimationFrame = ((cb: FrameRequestCallback) =>
      setTimeout(() => cb(0), 0)) as unknown as typeof requestAnimationFrame;
    (
      globalThis as { cancelAnimationFrame?: typeof cancelAnimationFrame }
    ).cancelAnimationFrame = ((id: number) =>
      clearTimeout(id)) as unknown as typeof cancelAnimationFrame;
    getMockInstances().length = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads the same VRM path after StrictMode abort/remount", async () => {
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      renderer = TestRenderer.create(
        <StrictMode>
          <VrmViewer
            vrmPath="/vrms/eliza-1.vrm.gz"
            createEngine={() => new MockVrmEngine() as never}
          />
        </StrictMode>,
        {
          createNodeMock: (element) => {
            if (element.type === "canvas") {
              return {
                getBoundingClientRect: () => ({
                  width: 640,
                  height: 480,
                  top: 0,
                  left: 0,
                  bottom: 480,
                  right: 640,
                  x: 0,
                  y: 0,
                  toJSON: () => ({}),
                }),
              };
            }
            return null;
          },
        },
      );
    });

    const instances = getMockInstances();

    expect(instances.length).toBeGreaterThanOrEqual(2);

    await act(async () => {
      for (const instance of instances) {
        instance.resolveReady();
      }
      await Promise.resolve();
      await Promise.resolve();
    });

    const totalLoadCalls = instances.reduce(
      (count, instance) => count + instance.loadVrmFromUrl.mock.calls.length,
      0,
    );
    expect(totalLoadCalls).toBe(1);
    expect(instances.at(-1)?.loadVrmFromUrl).toHaveBeenCalledWith(
      "/vrms/eliza-1.vrm.gz",
      "eliza-1.vrm.gz",
    );

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("loads VRM and applies environment theme after engine is ready", async () => {
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      renderer = TestRenderer.create(
        <VrmViewer
          vrmPath="/vrms/eliza-1.vrm.gz"
          environmentTheme="light"
          createEngine={() => new MockVrmEngine() as never}
        />,
        {
          createNodeMock: (element) => {
            if (element.type === "canvas") {
              return {
                getBoundingClientRect: () => ({
                  width: 640,
                  height: 480,
                  top: 0,
                  left: 0,
                  bottom: 480,
                  right: 640,
                  x: 0,
                  y: 0,
                  toJSON: () => ({}),
                }),
              };
            }
            return null;
          },
        },
      );
    });

    const [instance] = getMockInstances();
    expect(instance).toBeTruthy();

    await act(async () => {
      instance?.resolveReady();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(instance?.loadVrmFromUrl).toHaveBeenCalledWith(
      "/vrms/eliza-1.vrm.gz",
      "eliza-1.vrm.gz",
    );

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("does not reload the VRM when the environment theme changes", async () => {
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      renderer = TestRenderer.create(
        <VrmViewer
          vrmPath="/vrms/eliza-1.vrm.gz"
          environmentTheme="light"
          createEngine={() => new MockVrmEngine() as never}
        />,
        {
          createNodeMock: (element) => {
            if (element.type === "canvas") {
              return {
                getBoundingClientRect: () => ({
                  width: 640,
                  height: 480,
                  top: 0,
                  left: 0,
                  bottom: 480,
                  right: 640,
                  x: 0,
                  y: 0,
                  toJSON: () => ({}),
                }),
              };
            }
            return null;
          },
        },
      );
    });

    const [instance] = getMockInstances();
    expect(instance).toBeTruthy();

    await act(async () => {
      instance?.resolveReady();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(instance?.loadVrmFromUrl).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer?.update(
        <VrmViewer
          vrmPath="/vrms/eliza-1.vrm.gz"
          environmentTheme="dark"
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    // Theme change does not reload VRM
    expect(instance?.loadVrmFromUrl).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("surfaces renderer init failures as load errors without retrying VRM or world loads", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onEngineState = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      renderer = TestRenderer.create(
        <VrmViewer
          vrmPath="/vrms/eliza-1.vrm.gz"
          environmentTheme="light"
          onEngineState={onEngineState}
          createEngine={() => new MockVrmEngine() as never}
        />,
        {
          createNodeMock: (element) => {
            if (element.type === "canvas") {
              return {
                getBoundingClientRect: () => ({
                  width: 640,
                  height: 480,
                  top: 0,
                  left: 0,
                  bottom: 480,
                  right: 640,
                  x: 0,
                  y: 0,
                  toJSON: () => ({}),
                }),
              };
            }
            return null;
          },
        },
      );
    });

    const [instance] = getMockInstances();

    await act(async () => {
      instance?.rejectReady(new Error("Error creating WebGL context."));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onEngineState).toHaveBeenCalledWith(
      expect.objectContaining({
        vrmLoaded: false,
        loadError: "Error creating WebGL context.",
      }),
    );
    expect(instance?.setWorldUrl).not.toHaveBeenCalled();
    expect(instance?.loadVrmFromUrl).not.toHaveBeenCalled();

    const warningLabels = warnSpy.mock.calls.map((call) => call[0]);
    expect(warningLabels).toContain("Failed to initialize VRM renderer:");
    expect(warningLabels).not.toContain("Failed to load VRM:");
    expect(warningLabels).not.toContain("Failed to load environment:");

    warnSpy.mockRestore();

    await act(async () => {
      renderer?.unmount();
    });
  });
});
